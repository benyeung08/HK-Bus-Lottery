#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
從香港政府「資料一線通」(data.gov.hk) 抓取全港專營巴士路線清單，
輸出成 data/routes.json，供「香港巴士抽獎機」網站離線使用。

資料來源：
  九巴 / 龍運  https://data.etabus.gov.hk/v1/transport/kmb/route/
  城巴         https://rt.data.gov.hk/v2/transport/citybus/route/CTB
  嶼巴         https://rt.data.gov.hk/v2/transport/nlb/route.php?action=list

用法：
  python3 scripts/update_routes.py
任何一家抓不到，就沿用既有 data/routes.json 的舊資料，不會把檔案清空。
"""

import json
import os
import urllib.request
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "routes.json")

HEADERS = {
    "User-Agent": "hk-bus-lottery/1.0 (+https://github.com)",
    "Accept": "application/json",
}

# 抓不到資料時的離線備用清單（只含路線編號，不含起訖點）
FALLBACK = {
    "KMB": """1 1A 2 2A 2B 2E 2F 3B 3C 3D 5 5A 5C 5M 6 6C 6D 6F 7 7B 7M 8 8A 8P 9 10 11 11B 11C 11D 11K
12 12A 13D 13M 14 14B 14D 14H 14X 15 15A 16 16M 17 18 21 24 26 27 28 30X 31 31B 32 32M 33 33A 34
35A 36 36A 37 38 38A 40 40X 41A 41M 42 42A 42C 43 43C 43M 44 45 46 46X 47X 48X 49X 51 52X 53 58M
58X 59M 59X 60M 60X 61M 61X 63X 64K 64S 65K 66M 66X 67M 67X 68 68A 68M 68X 69C 69M 70K 71K 72 72A
72C 73 73A 73K 73X 74A 74K 74X 75K 75X 76K 77K 78K 79K 80 80K 80M 81 81C 81K 82K 83K 83X 85 85A 85K
85M 86 86A 86C 86K 87D 87K 88 88K 89 89B 89C 89D 89X 91 91M 92 93K 95 96 98A 98C 98D 99 101 101X
102 103 104 106 107 107P 109 110 111 112 113 115 116 117 118 170 171 182 203C 203E 205M 208 211
213B 213D 213X 215X 219X 224X 230X 234A 234B 234C 234X 235 238M 238X 240X 241X 242X 243M 249X 251A
251B 251C 258D 258P 258X 259D 259E 259X 260B 260C 260X 261B 261P 261X 263 263A 263B 263C 265B 265M
265S 267X 268B 268C 268M 268P 268X 269B 269C 269D 269M 269P 270 270A 270B 270K 270P 271 271B 271P
272P 272X 273 273A 273B 273C 273D 273P 273S 274X 276 276A 276B 276C 276P 277E 277P 277X 278A 278K
278P 278X 279X 280X 281 281A 281B 281E 281M 281X 282 284 285 285A 286C 286M 286P 286X 287D 287P
287X 288 288A 288B 288C 289K 290 290A 290B 290E 290X 292P 293 296A 296C 296D 296M 296P 297 297P
298C 298E 298F 299X""",
    "LWB": """A31 A32 A33 A33X A34 A36 A37 A38 A41 A41P A43 A47X E31 E32 E33 E33P E34A E34B E36 E36A
E36P E36S E37 E41 E42 E43 N31 N42A N64 R8 S1 S64 S64C S64P S64X""",
    "CTB": """1 1M 2 2A 2X 3A 4 4X 5B 5X 6 6A 6X 7 8 8P 8X 9 10 11 12 12A 12M 13 14 15 15B 15C 16 18
18P 18X 19 20 21 22 23 23B 25 26 27 30X 31 33X 37A 37B 37X 38 40 40M 40P 41A 42 42C 43M 47P 48 48P
49X 63 66 70 71 72 72A 73 73P 75 76 77 78 79X 81 81A 82 85 85A 90 90B 91 91A 93A 94A 95C 95P 96 97
98 99 511 592 595 629 679 681 682 690 701A 702 702B 793 795X 796P 796X 797 970 970X 971 973 A10 A11
A12 A17 A20 A21 A22 A23 A25 A26 A28 A29 E11 E11A E21 E21A E22 E22A E22P E23 E23A N11 N21 N23 N26
N29 N121 N122 N170 N182 N619 N680 N691 X970 B3 B3A B3X B5 B7 B8""",
    "NLB": """1 2 3M 4 11 23 34 36 37 37P 38 38X B2 B4 B6 N1 N35 N38""",
}


def get_json(url, timeout=30):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_kmb():
    """九巴 / 龍運：同一支 API，co 欄位區分公司。"""
    data = get_json("https://data.etabus.gov.hk/v1/transport/kmb/route/")["data"]
    seen, out = set(), []
    for r in data:
        if r.get("service_type") != "1":
            continue
        key = (r.get("co"), r.get("route"))
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "co": r.get("co", "KMB"),
            "route": r.get("route", ""),
            "orig": r.get("orig_tc", ""),
            "dest": r.get("dest_tc", ""),
        })
    return out


def fetch_ctb():
    data = get_json("https://rt.data.gov.hk/v2/transport/citybus/route/CTB")["data"]
    seen, out = set(), []
    for r in data:
        route = r.get("route", "")
        if not route or route in seen:
            continue
        seen.add(route)
        out.append({
            "co": "CTB",
            "route": route,
            "orig": r.get("orig_tc", ""),
            "dest": r.get("dest_tc", ""),
        })
    return out


def fetch_nlb():
    data = get_json("https://rt.data.gov.hk/v2/transport/nlb/route.php?action=list")["routes"]
    out = []
    for r in data:
        route = r.get("routeNo", "")
        if not route:
            continue
        name = r.get("routeName_c", "")
        parts = [p.strip() for p in name.replace("至", "↔").split("↔")] if name else []
        out.append({
            "co": "NLB",
            "route": route,
            "orig": parts[0] if parts else "",
            "dest": parts[1] if len(parts) > 1 else (parts[0] if parts else ""),
        })
    return out


def fallback_routes():
    out = []
    for co, blob in FALLBACK.items():
        for route in blob.split():
            out.append({"co": co, "route": route, "orig": "", "dest": ""})
    return out


def main():
    routes, sources = [], []
    for name, fn in (("KMB/LWB", fetch_kmb), ("CTB", fetch_ctb), ("NLB", fetch_nlb)):
        try:
            got = fn()
            routes.extend(got)
            sources.append(f"{name}:{len(got)}")
            print(f"[OK] {name} -> {len(got)} 條路線")
        except Exception as e:  # noqa: BLE001
            print(f"[WARN] {name} 抓取失敗：{e}")

    if not routes:
        if os.path.exists(OUT):
            print("[WARN] 全部抓取失敗，保留原有 data/routes.json")
            return
        routes = fallback_routes()
        sources.append("offline-fallback")
        print(f"[WARN] 改用離線備用清單（{len(routes)} 條）")

    routes = [r for r in routes if r.get("route")]
    routes.sort(key=lambda r: (r["co"], r["route"]))
    now = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S HKT")
    payload = {"generated": now, "sources": sources, "count": len(routes), "routes": routes}

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=0)
    print(f"[DONE] 已寫入 {os.path.relpath(OUT, ROOT)}，共 {len(routes)} 條路線（{now}）")


if __name__ == "__main__":
    main()
