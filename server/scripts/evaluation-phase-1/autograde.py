"""Draft-grade raw eval CSVs (questions-secassured.json) into graded_repN.csv
(semicolon format read by aggregate-metrics.ts). Mechanical cases are graded
automatically; everything else is marked REVIEW and listed for a human.
Manual decisions go in overrides.json: {"F5|RAG|2": ["Partial","No","note"], ...}.
Usage: python3 autograde.py <results-dir>"""
import csv, glob, json, os, re, sys
D = sys.argv[1]; HERE = os.path.dirname(os.path.abspath(__file__))
CAT = {s['shortName'] for s in json.load(open(os.path.join(HERE, 'catalog-secassured.json')))}
REFUSE = re.compile(r"(does not contain|doesn't contain|no relevant services|not (?:appear|available|listed|found|present|included|mentioned|specified|provided)|no information|don't have|do not have|unavailable|no (?:such|services? (?:in|are|with|have|match))|none of the services|cannot find|could not find|there are no|isn't (?:in|listed|available)|is not in)", re.I)
FACT = {'F1': ['certh'], 'F2': ['7'], 'F3': ['attack'], 'F4': ['hardware'], 'F5': ['15408', 'eucc', '17927', '17640', 'cyber security act', 'cyber resilience act', 'ai act'],
        'F6': ['security alert'], 'F7': ['assurance case'], 'F8': ['partner infrastructure'], 'F9': ['security operation twin'], 'F10': ['terminal']}
COMP = {'C1': ['AI4SOAR', 'CI-SIM', 'HTTP-SIM', 'MAG', 'MMT-PROBE', 'SECAISOAR', 'SECANOD', 'SECSIM'], 'C2': ['AALTO-EDGE5G', 'ORO-3GPP16', 'ORO-5GLAB'],
        'C3': ['SECASSURE4AI', 'SECATTSIM', 'SECINTERP', 'SECSAC'], 'C4': ['MAG', 'HTTP-SIM', 'MMT-PROBE', 'AI4SOAR'], 'C6': ['SECDEVTWIN', 'SECOPSTWIN'],
        'C7': ['PPC-EMOB', 'PPC-IIOT', 'SPS-DEVSECOPS', 'UIH-PROSUMER'], 'C8': ['SECANOD', 'SECDEVTWIN', 'SECSAC']}
ov = json.load(open(os.path.join(D, 'overrides.json'))) if os.path.exists(os.path.join(D, 'overrides.json')) else {}
review = []
def invented(ans):  # SHORT-NAME-like tokens that are not in the catalog
    return sorted({t for t in re.findall(r'\b[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+\b', ans) if t not in CAT})
for f in sorted(glob.glob(os.path.join(D, 'raw_rep*.csv'))):
    rows = list(csv.DictReader(open(f))); out = []
    for r in rows:
        a, q, cfg, cat = r['answer'], r['id'], r['config'], r['category']
        low = a.lower(); key = f"{q}|{cfg}|{r['rep']}"
        intent = 'Yes' if cfg == 'COLD' else ('Yes' if r['predicted_intent'] == r['expected_intent'] else 'No')
        g = None
        if r['error']: g = ('ERROR', 'No', 'rerun: ' + r['error'][:60])
        elif cat == 'casual': g = ('Correct', 'No', 'auto')
        elif cfg == 'COLD' and REFUSE.search(a) and not invented(a):
            g = ('Correct' if cat == 'adversarial' else 'Refused', 'No', 'auto')
        elif cfg == 'RAG' and q in FACT and all(k in low for k in FACT[q]) and not invented(a): g = ('Correct', 'No', 'auto')
        elif cfg == 'RAG' and q in COMP and not invented(a):
            hit = [s for s in COMP[q] if s.lower() in low]
            if len(hit) == len(COMP[q]): g = ('Correct', 'No', 'auto')
            elif hit: g = ('Partial', 'No', f'auto: {len(hit)}/{len(COMP[q])} listed')
        if key in ov: g = tuple(ov[key])
        if g is None:
            g = ('REVIEW', '', ''); review.append((key, invented(a), a))
        out.append({**r, 'Correctness': g[0], 'Intent_ok': intent, 'Hallucination': g[1], 'Notes': g[2]})
    rep = re.search(r'rep(\d+)', f).group(1)
    with open(os.path.join(D, f'graded_rep{rep}.csv'), 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=list(out[0].keys()), delimiter=';'); w.writeheader(); w.writerows(out)
print(f'{len(review)} rows to review')
for key, inv, a in review: print(f"## {key} inv={inv} :: {' '.join(a.split())[:260]}")
