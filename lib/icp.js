// lib/icp.js — v3.234: PÚBLICO-ALVO (ICP) DA ATLANTYX EM UM LUGAR SÓ
// Regra do fundador: campanhas pagas, orgânicas, prospecção e abordagem automática miram SÓ donos/sócios e C-levels
// (e diretoria/VP) de médias e grandes empresas B2B — nunca pessoa física, estudante, quem procura emprego nem
// público técnico/operacional (analista, desenvolvedor, engenheiro, técnico, coordenador, estagiário…).
// Antes o público estava escrito em 7+ lugares diferentes, e vários incluíam gerentes, "líderes de TI" e
// interesses de ferramenta (Power BI, SAP, Big data) que no Meta entregam para analistas e estudantes.

export const ICP_VERSAO = 'icp-donos-clevel-v2';

export const ICP_TEXTO = 'PÚBLICO-ALVO (obrigatório, v3.235): DONOS e sócios de empresas MÉDIAS e GRANDES (200+ funcionários) e os C-levels DESSAS empresas — CEO, CFO, COO, CIO, CTO, CDO (no Brasil, também diretores estatutários: Diretor Financeiro, de Operações, de Tecnologia) — de empresas brasileiras (energia e utilities, bancos e seguradoras, indústria, infraestrutura, varejo e serviços de grande porte). Fale com quem DECIDE e responde por resultado: ganho financeiro, risco, prazo, controle e vantagem competitiva — linguagem executiva, sem jargão técnico de ferramenta. NUNCA escreva para pessoa física, estudante, quem procura emprego/carreira ou público técnico/operacional (analistas, desenvolvedores, engenheiros, técnicos, coordenadores, estagiários): nada de tutorial, curso, vaga, certificação ou "como fazer" técnico.';

export const ICP_RESUMO = 'Donos e sócios de médias e grandes empresas e os C-levels dessas empresas (CEO, CFO, COO, CIO, CTO, CDO e diretores estatutários)';

export const ICP_SETORES = ['Energia e utilities', 'Bancos e seguradoras', 'Indústria', 'Infraestrutura', 'Varejo de grande porte', 'Serviços de grande porte'];

// Cargos que são o ICP (decisores) e cargos que NÃO são (técnico/operacional/início de carreira)
export const CARGOS_ICP = ['CEO', 'CFO', 'COO', 'CIO', 'CTO', 'CDO', 'CMO', 'CRO', 'Presidente', 'Vice-presidente', 'VP', 'Diretor', 'Diretora', 'Sócio', 'Sócia', 'Fundador', 'Fundadora', 'Proprietário', 'Proprietária', 'Dono', 'Conselheiro', 'Superintendente', 'Head'];
const _RE_CLEVEL = /\b(ceo|cfo|coo|cio|cto|cdo|cmo|cro|cso|cco|chief|presidente|president|founder|fundador[a]?|co-?founder|s[oó]ci[oa]|partner|propriet[aá]ri[oa]|dono|dona|owner|conselh(eiro|eira)|board)\b/i;
const _RE_DIRETOR = /\b(diretor[a]?|director|vp|vice[- ]?presidente?|vice[- ]?president|superintendente|managing director|country manager)\b/i;
const _RE_HEAD = /\b(head)\b/i;
const _RE_FORA = /\b(analista|analyst|desenvolvedor[a]?|developer|dev|programador[a]?|engenheir[oa]|engineer|t[eé]cnic[oa]|technician|coordenador[a]?|coordinator|supervisor[a]?|assistente|assistant|auxiliar|estagi[aá]ri[oa]|intern|trainee|jovem aprendiz|estudante|student|consultor j[uú]nior|j[uú]nior|pleno|s[eê]nior|especialista|specialist|suporte|support|operador[a]?|atendente|vendedor[a]?|freelancer|aut[oô]nomo|professor[a]?|scrum master|product owner|qa|tester|devops|sre|cientista de dados|data scientist|arquitet[oa]|architect)\b/i;

// Classifica um cargo: 'decisor' (C-level/dono/diretor) · 'head' (aceito com cautela) · 'fora' (técnico/operacional) · 'indefinido'
export function classificarCargo(cargo) {
  const t = String(cargo || '').trim();
  if (!t) return 'indefinido';
  if (_RE_CLEVEL.test(t)) return 'decisor';                 // "CEO", "Sócio-diretor", "Founder & CTO"
  if (_RE_DIRETOR.test(t) && !/\b(assistente|secret[aá]ri[oa]|assistant)\b/i.test(t)) return 'decisor'; // "Diretor de TI" (não "assistente de diretoria")
  if (_RE_FORA.test(t)) return 'fora';                       // "Analista de Negócios", "Engenheiro de Dados", "Coordenador de TI"
  if (_RE_HEAD.test(t)) return 'head';
  if (/\b(gerente|manager|gestor[a]?|l[ií]der|lead)\b/i.test(t)) return 'gerencia';
  return 'indefinido';
}
export const cargoEhIcp = cargo => ['decisor', 'head'].includes(classificarCargo(cargo));

// Apollo: senioridade e porte (funcionários) — sempre enviados na busca de pessoas
export const APOLLO_SENIORIDADES = ['owner', 'founder', 'c_suite', 'partner', 'vp', 'director'];
export const APOLLO_PORTES = ['201,500', '501,1000', '1001,2000', '2001,5000', '5001,10000', '10001,'];
export const APOLLO_TITULOS = ['CEO', 'CFO', 'COO', 'CIO', 'CTO', 'CDO', 'Chief Data Officer', 'Chief Digital Officer', 'Diretor', 'Diretor Financeiro', 'Diretor de Tecnologia', 'Diretor de TI', 'Diretor de Operações', 'VP', 'Vice-Presidente', 'Sócio', 'Fundador', 'Presidente'];

// Meta Ads: público de decisores — idade mínima, interesses de cargo executivo (sem ferramenta/skill técnico),
// comportamentos/setores de GESTÃO (nunca "TI e serviços técnicos", "Computação", "Engenharia", dono de pequena
// empresa ou administrador de página) e exclusões (emprego, estudo, programação, cursos)
export const META_IDADE_MIN = 35;
export const META_IDADE_MAX = 65;
export const META_INTERESSES = ['Chief executive officer', 'Chief financial officer', 'Chief operating officer', 'Chief information officer', 'Chief technology officer', 'Board of directors', 'Executive (management)', 'Corporate governance', 'Business strategy', 'Mergers and acquisitions', 'Private equity', 'Harvard Business Review'];
export const META_COMPORT = /business decision maker|decisores? de neg[oó]cio|tomador(es)? de decis/i;
export const META_SETOR = /^(management|gest[aã]o|administra[cç][aã]o|business and finance|neg[oó]cios e finan[cç]as)/i;
export const META_EXCLUIR = ['Job hunting', 'Concurso público', 'Vagas de emprego', 'Estágio', 'Jovem aprendiz', 'Apostas esportivas', 'Computer programming', 'Programação de computadores', 'Bootcamp', 'Curso técnico', 'Certificação profissional', 'Student', 'Freelancer', 'Online games'];

// Palavras negativas para anúncios de busca (Google) e filtros de conteúdo
export const NEGATIVAS_BUSCA = ['vaga', 'vagas', 'emprego', 'estágio', 'curso', 'cursos', 'certificação', 'salário', 'carreira', 'tutorial', 'grátis', 'gratuito', 'download', 'apostila', 'faculdade', 'o que é', 'como fazer', 'freelancer', 'concurso'];
export const RE_CONTEUDO_FORA_ICP = /\b(vaga|vagas|emprego|est[aá]gio|carreira|sal[aá]rio|curso|tutorial|passo a passo|certifica[cç][aã]o|entrevista de emprego|j[uú]nior|primeiro emprego|bootcamp|faculdade|estudante)\b/i;
