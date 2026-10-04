import re,sys
# v3.88: usado pelo claude-pr.yml no "Aprovar e mesclar" da Esteira de Demandas
# Resolve conflitos SÓ quando os dois lados são linhas de versão (ATX-vX.YY / ATLANTYX vX.YY) — mantém o HEAD.
p=sys.argv[1]; s=open(p).read()
pat=re.compile(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', re.S)
ver=re.compile(r"ATX-v\d+\.\d+|ATLANTYX v\d+\.\d+")
ruins=[]
def rep(m):
    a,b=m.group(1),m.group(2)
    la=[l for l in a.splitlines() if l.strip()]; lb=[l for l in b.splitlines() if l.strip()]
    if la and lb and all(ver.search(l) for l in la+lb) and len(la)==len(lb): return a
    ruins.append(m.group(0)[:300]); return m.group(0)
s2=pat.sub(rep,s); open(p,'w').write(s2)
print('conflitos não-versão:',len(ruins)); [print(r) for r in ruins]
sys.exit(1 if ruins else 0)
