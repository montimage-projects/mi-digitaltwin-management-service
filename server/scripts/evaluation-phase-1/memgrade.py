"""Grade memory dialogues (questions-memory.json) by keyword; print failures."""
import csv, glob, sys, collections
D = sys.argv[1]
K = {'M1': ['mag', 'montimage'], 'M2': ['7'], 'M3': ['secsac'], 'M4': ['mmt-probe', 'mag']}
NO_HISTORY = ("don't have access", "do not have access", "no access to", "don't retain", "cannot recall", "can't recall", "don't have memory")
res = collections.Counter(); fails = []
for f in sorted(glob.glob(f'{D}/memory_raw_rep*.csv')):
    for r in csv.DictReader(open(f)):
        low = r['answer'].lower()
        ok = not r['error'] and all(k in low for k in K[r['id']]) and not any(p in low for p in NO_HISTORY)
        res[(r['config'], ok)] += 1
        if not ok: fails.append(f"{r['id']}|{r['config']}|{r['rep']} err={r['error'][:40]} :: {' '.join(r['answer'].split())[:200]}")
for cfg in ('RAG', 'COLD'): print(f"{cfg}: {res[(cfg, True)]}/{res[(cfg, True)] + res[(cfg, False)]} correct")
print('\n'.join(fails))
