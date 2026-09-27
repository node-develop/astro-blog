"""Build src/data/ms_ai.json from Microsoft AI Economy Institute's AI Diffusion data.

Source: https://github.com/microsoft/ai-diffusion-report (MIT), file
data/AI_Diffusion_Q22026_Update.csv. Metric: share of the working-age
population (15-64) that used a generative AI product in the period.
Paper: Misra et al. 2025, arXiv:2511.02781.

Run: python3 data-sources/microsoft-ai-diffusion/build.py
"""
import csv, json, pathlib, statistics, unicodedata

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
countries = json.loads((ROOT / "src/data/countries.json").read_text())
gallup = json.loads((ROOT / "src/data/gallup.json").read_text())

def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return "".join(ch for ch in s if ch.isalnum())

by_name = {norm(c["en"]): c["id"] for c in countries}
ALIAS = {
    "turkiye": "TR", "trkiye": "TR", "unitedstates": "US", "unitedkingdom": "GB",
    "southkorea": "KR", "korea": "KR", "korearep": "KR", "russia": "RU", "russianfederation": "RU",
    "vietnam": "VN", "vietnm": "VN", "czechia": "CZ", "czechrepublic": "CZ",
    "hongkongsar": "HK", "hongkong": "HK", "hongkongsarchina": "HK", "taiwan": "TW",
    "egypt": "EG", "iran": "IR", "laos": "LA", "moldova": "MD", "kyrgyzstan": "KG",
    "slovakia": "SK", "bosniaandherzegovina": "BA", "northmacedonia": "MK",
    "cotedivoire": "CI", "myanmar": "MM", "congodrc": "CD", "drcongo": "CD", "congodr": "CD", "democraticrepublicofthecongo": "CD",
    "republicofthecongo": "CG", "congo": "CG", "venezuela": "VE", "bolivia": "BO",
    "palestinianterritories": "PS", "palestine": "PS", "westbankandgaza": "PS",
    "syria": "SY", "yemen": "YE", "gambia": "GM", "bahamas": "BS", "brunei": "BN",
    "macau": "MO", "macao": "MO", "tanzania": "TZ", "puertorico": "PR",
}

raw = (HERE / "AI_Diffusion_Q22026_Update.csv").read_bytes().decode("latin-1")
rows = list(csv.DictReader(raw.splitlines()))
out, missing = {}, []
pc = lambda v: round(float(v.strip().rstrip("%")), 1) if v.strip() else None
for r in rows:
    name = r["Economy"].strip()
    iso = ALIAS.get(norm(name)) or by_name.get(norm(name))
    if not iso:
        missing.append(name)
        continue
    q2, h1 = pc(r["Q2 2026 AI Diffusion"]), pc(r["H1 2025 AI Diffusion"])
    if q2 is not None:
        out[iso] = {"q2_26": q2, "h1_25": h1}

# Calibrate Microsoft's share onto Gallup's ladder on the countries both cover:
# the median ratio per level turns a Microsoft share into a Gallup-like estimate.
# One median ratio over every country both sources cover. Microsoft reads
# much lower than Gallup in Russia, Kazakhstan and Ukraine (2.5 to 4 times),
# likely because its telemetry misses blocked or less used products there;
# a separate CIS ratio overshoots for Georgia or Azerbaijan, so the estimate
# stays conservative and the UI says it may undercount the CIS.
ladder = gallup["ladder"]
r = {"ever": [], "weekly": [], "daily": []}
for iso, l in ladder.items():
    m = out.get(iso)
    if not m or not m["q2_26"]:
        continue
    r["daily"].append(l["d"] / m["q2_26"])
    r["weekly"].append((l["d"] + l["w"]) / m["q2_26"])
    r["ever"].append((l["d"] + l["w"] + l["m"]) / m["q2_26"])
calib = {k: round(statistics.median(v), 3) for k, v in r.items()}
n_both = len(r["weekly"])

def spearman(xs, ys):
    rank = lambda a: {v: i for i, v in enumerate(sorted(a))}
    rx, ry = rank(xs), rank(ys)
    n = len(xs)
    return 1 - 6 * sum((rx[x] - ry[y]) ** 2 for x, y in zip(xs, ys)) / (n * (n * n - 1))

both = [iso for iso in ladder if iso in out]
rho = spearman([out[i]["q2_26"] for i in both], [ladder[i]["d"] + ladder[i]["w"] for i in both])

result = {
    "source": {
        "title": "Global AI Diffusion, Q2 2026 update",
        "publisher": "Microsoft AI Economy Institute",
        "url": "https://github.com/microsoft/ai-diffusion-report",
        "paper": "https://arxiv.org/abs/2511.02781",
        "metric": "Share of the working-age population (15-64) that used a generative AI product in the period",
        "license": "MIT",
    },
    "calibration": {"n": n_both, "spearman_weekly": round(rho, 2), "ratio": calib},
    "share": dict(sorted(out.items())),
}
(ROOT / "src/data/ms_ai.json").write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
print(f"mapped {len(out)} of {len(rows)}; unmatched: {missing}")
print("calibration", result["calibration"])
