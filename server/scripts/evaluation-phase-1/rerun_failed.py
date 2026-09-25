"""Re-run rows whose `error` is set and merge them back into their rep files.
Usage: python3 rerun_failed.py <results-dir> <base-url> <questions-file> <raw-prefix: raw|memory_raw>"""
import csv, glob, os, subprocess, sys, collections
D, URL, QF, PFX = sys.argv[1:5]
groups = collections.defaultdict(list)
for f in sorted(glob.glob(f'{D}/{PFX}_rep*.csv')):
    for r in csv.DictReader(open(f)):
        if r['error']: groups[(f, r['rep'], r['config'])].append(r['id'])
print(f'{sum(map(len, groups.values()))} failed rows')
for (f, rep, cfg), ids in groups.items():
    tmp = f'{D}/_rerun.csv'
    subprocess.run(['bun', 'run-eval.ts', f'--base-url={URL}', '--password=IntactAdmin2026!', '--reps=1', '--warmup=false',
                    f'--questions={QF}', f'--configs={cfg}', f"--only={','.join(ids)}", f'--out={tmp}'], cwd=os.path.dirname(os.path.abspath(__file__)),
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not os.path.exists(tmp):
        print(f'{os.path.basename(f)} {cfg}: harness produced no output, skipped'); continue
    new = {r['id']: {**r, 'rep': rep} for r in csv.DictReader(open(tmp))}; os.remove(tmp)
    rows = list(csv.DictReader(open(f)))
    rows = [new.get(r['id'], r) if (r['config'] == cfg and r['error']) else r for r in rows]
    with open(f, 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    print(f"{os.path.basename(f)} {cfg}: reran {len(ids)}, still failing {sum(1 for i in ids if new.get(i, {'error': 'x'})['error'])}")
