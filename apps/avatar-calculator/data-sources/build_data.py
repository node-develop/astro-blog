import json, statistics
from babel import Locale
ru_names = Locale('ru').territories; en_names = Locale('en').territories
wb = json.load(open('wb_raw.json')); firms = json.load(open('firms.json')); rg = json.load(open('ru_and_gaps.json'))
CIS = {'RU','BY','KZ','UZ','KG','TJ','AM','AZ','MD','TM','GE','UA'}
EU_EXTRA = {'TR','IL','CY'}
def region(c):
    r = c['region'].strip(); i = c['iso2']
    if i in ('AF','PK'): return 'asia'
    if i == 'MT': return 'europe'
    if i in CIS: return 'cis'
    if r.startswith('Europe'): return 'europe'
    if r == 'North America': return 'namerica'
    if r.startswith('Latin America'): return 'latam'
    if r.startswith('Middle East'): return 'mena'
    if r == 'Sub-Saharan Africa': return 'africa'
    return 'asia'  # East Asia & Pacific, South Asia
RENAME_RU = {'PG':'Папуа Новая Гвинея','MT':'Мальта','MK':'Северная Македония','CD':'ДР Конго','CG':'Республика Конго','KP':'КНДР','KR':'Южная Корея','US':'США','GB':'Великобритания','AE':'ОАЭ','CZ':'Чехия','BA':'Босния и Герцеговина','CF':'ЦАР','HK':'Гонконг','MO':'Макао','PS':'Палестина','LA':'Лаос','MM':'Мьянма','CI':'Кот-д’Ивуар','XK':'Косово'}
RENAME_EN = {'KR':'South Korea','KP':'North Korea','CD':'DR Congo','CG':'Republic of the Congo','HK':'Hong Kong','MO':'Macao','PS':'Palestine','XK':'Kosovo','CI':"Côte d'Ivoire"}
out = []
pairs = sorted(v['pay_online']/v['buy_online'] for v in wb.values() if v.get('pay_online') and v.get('buy_online') and v['income'].startswith('High'))
PAY_RATIO = pairs[len(pairs)//2]
print('pay/buy median ratio', round(PAY_RATIO,3))
rows = [c for c in wb.values() if c.get('pop',0) >= 400_000 and 'inet' in c and 'age1564' in c]
# regional medians for gaps
def med(key, reg):
    vals = [c[key] for c in rows if region(c)==reg and c.get(key) not in (None,) and not (key=='pay_online' and c[key]==0)]
    return statistics.median(vals) if vals else None
firm_rate = {}
for c in rows:
    f = firms.get(c['iso2'])
    if f and f.get('firms_total'): firm_rate.setdefault(region(c), []).append(f['firms_total']/c['pop'])
firm_rate = {k: statistics.median(v) for k,v in firm_rate.items()}
emp_rate = {}
for c in rows:
    f = firms.get(c['iso2'])
    if f and f.get('firms_employer') and f.get('firms_total'): emp_rate.setdefault(region(c), []).append(f['firms_employer']/f['firms_total'])
emp_rate = {k: statistics.median(v) for k,v in emp_rate.items()}
for c in rows:
    i = c['iso2']; reg = region(c); notes = []
    buy = c.get('buy_online'); buy_yr = c.get('buy_online_yr'); buy_src = 'findex'
    if buy is None:
        g = rg['ecom_gaps'].get(i)
        if g: buy, buy_yr, buy_src = g['ecom_pct'], 2025, 'est'
        else: buy, buy_yr, buy_src = med('buy_online', reg), None, 'region'
    if i == 'RU':
        buy, buy_yr, buy_src = 65.0, 2024, 'est'  # VTsIOM 2024 (71% of 18+), Findex 2021 = 46%
        notes.append('buy_ru')
    pay = c.get('pay_online'); pay_yr = c.get('pay_online_yr')
    pay_est = False
    if pay is None or pay == 0:
        pay, pay_yr, pay_est = (buy * PAY_RATIO if buy is not None else None), buy_yr, True
    ru = rg['ru'].get(i)
    f = firms.get(i) or {}
    ft = f.get('firms_total'); fe = f.get('firms_employer'); fest = bool(f.get('est'))
    if not ft:
        ft = round(c['pop'] * firm_rate.get(reg, 0.03)); fest = True
    if not fe:
        fe = round(ft * emp_rate.get(reg, 0.3)); fest = True
    out.append({
        'id': i, 'ru': RENAME_RU.get(i, ru_names.get(i, c['name_en'])), 'en': RENAME_EN.get(i, en_names.get(i, c['name_en'])),
        'reg': reg, 'pop': round(c['pop']), 'popY': c['pop_yr'],
        'a0': round(c['age0014'],1), 'a1': round(c['age1564'],1), 'a2': round(c['age65'],1), 'ageY': c['age1564_yr'],
        'inet': round(c['inet'],1), 'inetY': c['inet_yr'],
        'buy': round(buy,1) if buy is not None else None, 'buyY': buy_yr, 'buyS': buy_src,
        'pay': round(pay,1) if pay is not None else None, 'payY': pay_yr, 'payE': pay_est,
        'card': round(c['debit'],1) if c.get('debit') is not None else None,
        'gdp': round(c['gdp']) if c.get('gdp') else None, 'ppp': round(c['gdp_ppp']) if c.get('gdp_ppp') else None,
        'rus': ru['ru_pct'] if ru else 0.05, 'rusE': (ru['est'] if ru else True),
        'firms': ft, 'emp': fe, 'firmsE': fest, 'firmsY': f.get('year'),
    })
out.sort(key=lambda x: -x['pop'])
json.dump(out, open('../src/data/countries.json','w'), ensure_ascii=False, separators=(',',':'))
print(len(out), 'countries; buy from region median:', sum(1 for x in out if x['buyS']=='region'), [x['ru'] for x in out if x['buyS']=='region'])
print('no buy at all:', [x['ru'] for x in out if x['buy'] is None])
from collections import Counter; print(Counter(x['reg'] for x in out))
print([ (x['ru'],x['en']) for x in out if x['ru']==x['en'] or not x['ru']][:20])
