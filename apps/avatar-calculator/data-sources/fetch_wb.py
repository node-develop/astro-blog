import json, urllib.request, time
BASE="https://api.worldbank.org/v2"
def get(url):
    for a in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as r: return json.load(r)
        except Exception as e:
            time.sleep(2+a*3); err=e
    raise err
# countries (non-aggregates)
cs=get(f"{BASE}/country?format=json&per_page=400")[1]
countries={c['iso2Code']:{'iso2':c['iso2Code'],'iso3':c['id'],'name_en':c['name'],'region':c['region']['value'],'income':c['incomeLevel']['value']} for c in cs if c['region']['value']!='Aggregates'}
IND={
 'pop':('SP.POP.TOTL',None),'age0014':('SP.POP.0014.TO.ZS',None),'age1564':('SP.POP.1564.TO.ZS',None),'age65':('SP.POP.65UP.TO.ZS',None),
 'inet':('IT.NET.USER.ZS',None),'labor':('SL.TLF.TOTL.IN',None),'gdp':('NY.GDP.PCAP.CD',None),'gdp_ppp':('NY.GDP.PCAP.PP.CD',None),
 'urban':('SP.URB.TOTL.IN.ZS',None),'mobile':('IT.CEL.SETS.P2',None),
 'buy_online':('fin26b',28),'pay_online':('fin27a',28),'debit':('fin2.t.d',28),'credit':('fin10',28),'account':('account.t.d',28),
}
for key,(code,src) in IND.items():
    url=f"{BASE}/country/all/indicator/{code}?format=json&per_page=20000&mrnev=1"+(f"&source={src}" if src else "")
    d=get(url)
    n=0
    for row in (d[1] or []):
        iso2=row['country']['id']
        if len(iso2)!=2:  # findex may return iso3 in country.id
            iso2=next((k for k,v in countries.items() if v['iso3']==row.get('countryiso3code') or v['iso3']==iso2),None)
        if iso2 in countries and row['value'] is not None:
            countries[iso2][key]=round(float(row['value']),3); countries[iso2][key+'_yr']=int(row['date'][:4]); n+=1
    print(key,code,n,flush=True)
json.dump(countries,open('wb_raw.json','w'),ensure_ascii=False,indent=1)
