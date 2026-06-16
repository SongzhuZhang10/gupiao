/** Inline Python executed by `pythonBridge.ts` — kept separate for unit testing. */
export function buildPythonBridgeScript(): string {
  return `
import json
import os
import sys

def symbol_code(symbol):
    return symbol[:6]

def ts_code(symbol):
    suffix = ".SH" if symbol.upper().endswith(".SH") else ".SZ"
    return symbol_code(symbol) + suffix

def iso_date(value):
    text = str(value or "").strip()
    if len(text) >= 10:
        return text[:10]
    if len(text) == 8 and text.isdigit():
        return f"{text[0:4]}-{text[4:6]}-{text[6:8]}"
    return text

def sina_daily_rows(payload):
    import akshare as ak
    symbol = payload["symbol"]
    prefix = "sh" if symbol.upper().endswith(".SH") else "sz"
    code = prefix + symbol_code(symbol)
    start = payload["startDate"].replace("-", "")
    end = payload["endDate"].replace("-", "")
    df = ak.stock_zh_a_daily(symbol=code, start_date=start, end_date=end, adjust="qfq")
    rows = []
    for _, row in df.iterrows():
        rows.append({
            "date": iso_date(row["date"]),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]),
            "amount": float(row["amount"]),
        })
    return rows

def akshare_daily_rows(payload):
    import akshare as ak
    code = symbol_code(payload["symbol"])
    start = payload["startDate"].replace("-", "")
    end = payload["endDate"].replace("-", "")
    try:
        df = ak.stock_zh_a_hist(
            symbol=code,
            period="daily",
            start_date=start,
            end_date=end,
            adjust="",
        )
    except Exception:
        return sina_daily_rows(payload)
    rows = []
    for _, row in df.iterrows():
        rows.append({
            "date": iso_date(row["日期"]),
            "open": float(row["开盘"]),
            "high": float(row["最高"]),
            "low": float(row["最低"]),
            "close": float(row["收盘"]),
            "volume": float(row["成交量"]),
            "amount": float(row["成交额"]),
        })
    return rows

def run_baostock(action, payload):
    import baostock as bs
    if action != "daily_bars":
        raise RuntimeError("unsupported baostock action")
    symbol = payload["symbol"]
    code = ("sh." if symbol.endswith(".SH") else "sz.") + symbol_code(symbol)
    try:
        lg = bs.login()
        if lg.error_code != "0":
            raise RuntimeError(lg.error_msg)
        rs = bs.query_history_k_data_plus(
            code,
            "date,open,high,low,close,volume,amount",
            start_date=payload["startDate"],
            end_date=payload["endDate"],
            frequency="d",
            adjustflag="3",
        )
        rows = []
        while rs.next():
            rows.append(dict(zip(rs.fields, rs.get_row_data())))
        bs.logout()
        if rows:
            return rows
    except Exception:
        pass
    return sina_daily_rows(payload)

def akshare_dividend_rows(payload):
    import akshare as ak
    code = symbol_code(payload["symbol"])
    df = ak.stock_dividend_cninfo(symbol=code)
    start = payload.get("startDate")
    end = payload.get("endDate")
    rows = []
    for _, row in df.iterrows():
        ex_date = iso_date(row.get("除权除息日") or row.get("除权日") or "")
        if not ex_date:
            continue
        if start and ex_date < start:
            continue
        if end and ex_date > end:
            continue
        payout = row.get("派息比例", 0)
        try:
            cash = float(payout) / 10.0
        except (TypeError, ValueError):
            cash = 0.0
        if cash <= 0:
            continue
        rows.append({
            "ex_date": ex_date,
            "announcement_date": iso_date(row.get("实施方案公告日期", "")),
            "record_date": iso_date(row.get("股权登记日", "")),
            "cash_dividend": cash,
            "dividend_description": str(row.get("分红类型", "")),
            "source_reference": code,
        })
    return rows

def run_akshare(action, payload):
    if action == "daily_bars":
        return akshare_daily_rows(payload)
    if action == "dividend_events":
        return akshare_dividend_rows(payload)
    raise RuntimeError(f"unsupported akshare action {action}")

def run_cninfo(action, payload):
    if action == "daily_bars":
        return sina_daily_rows(payload)
    if action == "dividend_events":
        return akshare_dividend_rows(payload)
    raise RuntimeError(f"unsupported cninfo action {action}")

def run_tushare(action, payload):
    token = os.environ.get("TUSHARE_TOKEN", "").strip()
    if not token:
        if action == "daily_bars":
            return sina_daily_rows(payload)
        raise RuntimeError("TUSHARE_TOKEN 未配置")
    import tushare as ts
    ts.set_token(token)
    pro = ts.pro_api()
    code = ts_code(payload["symbol"])
    if action == "daily_bars":
        df = pro.daily(
            ts_code=code,
            start_date=payload["startDate"].replace("-", ""),
            end_date=payload["endDate"].replace("-", ""),
        )
        rows = []
        for _, row in df.sort_values("trade_date").iterrows():
            trade_date = iso_date(row["trade_date"])
            rows.append({
                "date": trade_date,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row["vol"]) * 100,
                "amount": float(row["amount"]) * 1000,
            })
        return rows
    if action == "dividend_events":
        df = pro.dividend(ts_code=code)
        start = payload.get("startDate")
        end = payload.get("endDate")
        rows = []
        for _, row in df.iterrows():
            ex_date = iso_date(row.get("ex_date", ""))
            if not ex_date:
                continue
            if start and ex_date < start:
                continue
            if end and ex_date > end:
                continue
            cash = row.get("cash_div")
            try:
                cash_value = float(cash)
            except (TypeError, ValueError):
                cash_value = 0.0
            if cash_value <= 0:
                continue
            rows.append({
                "ex_date": ex_date,
                "announcement_date": iso_date(row.get("ann_date", "")),
                "record_date": iso_date(row.get("record_date", "")),
                "cash_dividend": cash_value,
                "dividend_description": "tushare cash dividend per share",
                "source_reference": code,
            })
        return rows
    raise RuntimeError(f"unsupported tushare action {action}")

try:
    envelope = json.loads(sys.stdin.read())
    provider = envelope["_provider"]
    action = envelope["_action"]
    payload = envelope["_payload"]

    if provider == "baostock":
        result = run_baostock(action, payload)
    elif provider == "akshare_generic":
        result = run_akshare(action, payload)
    elif provider == "cninfo":
        result = run_cninfo(action, payload)
    elif provider == "tushare":
        result = run_tushare(action, payload)
    else:
        raise RuntimeError(f"unsupported provider {provider}")

    print(json.dumps(result, ensure_ascii=False))
except Exception as exc:
    print(json.dumps({"error": str(exc)}, ensure_ascii=False))
    sys.exit(1)
`;
}
