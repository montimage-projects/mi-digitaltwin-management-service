"""Accuracy with Wilson 95% CIs over QUESTIONS (not runs) + run-to-run agreement.
A question counts as correct if graded Correct in the majority of its runs
(for adversarial / agent-safety, a correct decline is graded Correct).
Usage: python3 stats.py <results/secassured>   -> markdown on stdout"""
import csv, glob, math, sys, collections
D = sys.argv[1]
def wilson(k, n, z=1.96):
    if n == 0: return (0, 0)
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)
SETS = [('Main set, RAG', 'graded_rep*.csv', 'RAG', ['factual', 'comparative', 'adversarial']),
        ('Hard set (before fix)', 'graded_hard_rep*.csv', 'RAG', ['tool-selection', 'ambiguity', 'constraint', 'multi-hop', 'scenario-config', 'agent-safety']),
        ('Hard subset (after fix)', 'graded_hard_after_rep*.csv', 'RAG', ['scenario-config', 'agent-safety'])]
models = ['qwen3-14b', 'nemotron-3-ultra']
print('| Set | Category | ' + ' | '.join(f'{m}: correct (95% CI) · agreement' for m in models) + ' |')
print('|---|---|' + '---|' * len(models))
for title, pat, cfg, cats in SETS:
    per = {}
    for m in models:
        g = collections.defaultdict(list)
        for f in glob.glob(f'{D}/{m}/{pat}'):
            for r in csv.DictReader(open(f), delimiter=';'):
                if r['config'] == cfg and r['Correctness'] != 'ERROR': g[(r['category'], r['id'])].append(r['Correctness'])
        per[m] = g
    for cat in cats:
        cells = []
        for m in models:
            qs = [v for (c, _), v in per[m].items() if c == cat]
            if not qs: cells.append('–'); continue
            k = sum(1 for v in qs if sum(x == 'Correct' for x in v) > len(v) / 2); n = len(qs)
            lo, hi = wilson(k, n); agree = sum(len(set(v)) == 1 for v in qs)
            reps = max(len(v) for v in qs)
            cells.append(f'{k}/{n} = {k / n:.0%} [{lo:.0%}, {hi:.0%}] · ' + (f'{agree}/{n} same across {reps} runs' if reps > 1 else '1 run'))
        print(f'| {title} | {cat} | ' + ' | '.join(cells) + ' |')
