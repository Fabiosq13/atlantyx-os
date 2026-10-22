import { comGuarda } from '../lib/qa-guard.js';
// api/briefing-cron.js
// S7-08 Agente de Preparação de Reunião — Cron que verifica reuniões das próximas 24h
// Chamado a cada hora pelo Vercel Cron

async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) { // v3.237
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    console.log('[S7-08] Verificando reuniões para briefing...');

    // Buscar deals na etapa "Reunião Agendada" com data nas próximas 24h
    const deals = await buscarReunioesProximas24h();
    console.log(`[S7-08] ${deals.length} reuniões nas próximas 24h`);

    const briefingsGerados = [];
    // v3.237: marca própria por deal no banco (antes qualquer nota do deal contava como "briefing feito", e uma falha
    // silenciosa do HubSpot fazia reenviar o briefing por WhatsApp de hora em hora); até 3 por execução (limite de tempo)
    const { neon } = await import('@neondatabase/serverless'); const sqlB = neon(process.env.DATABASE_URL);
    const marcado = async id => { try { return !!(await sqlB`SELECT 1 FROM kv_store WHERE key = ${'briefing:' + id} LIMIT 1`).length; } catch (_) { return false; } };
    const marcar = async id => { try { await sqlB`INSERT INTO kv_store (key, value, updated_at) VALUES (${'briefing:' + id}, ${JSON.stringify({ em: new Date().toISOString() })}, NOW()) ON CONFLICT (key) DO NOTHING`; } catch (_) {} };
    let feitos = 0;
    for (const deal of deals) {
      if (feitos >= 3) break;
      try {
        if (await marcado(deal.id)) continue;
        const jaGerado = false;
        if (jaGerado) {
          console.log(`[S7-08] Briefing já gerado para deal ${deal.id}`);
          continue;
        }

        // Gerar briefing via meeting-schedule
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;

        await marcar(deal.id); feitos++; // marca ANTES de notificar: se algo falhar no meio, não repete o WhatsApp a cada hora
        const rb = await fetch(`${baseUrl}/api/meeting-schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'gerar_briefing',
            lead_name: deal.lead_name,
            lead_company: deal.company,
            lead_cargo: deal.cargo,
            lead_setor: deal.setor,
            data_hora: deal.data_reuniao,
            deal_id: deal.id,
          })
        });

        const jb = await rb.json().catch(() => ({}));
        if (!rb.ok || jb.success === false) { console.error(`[S7-08] briefing falhou para ${deal.id}: ${jb.error || rb.status}`); continue; }
        briefingsGerados.push({ deal: deal.id, lead: deal.lead_name });
        console.log(`[S7-08] Briefing gerado: ${deal.lead_name}`);
      } catch (e) {
        console.error(`[ERRO] Deal ${deal.id}:`, e.message);
      }
    }

    return res.status(200).json({
      success: true,
      reunioes_verificadas: deals.length,
      briefings_gerados: briefingsGerados.length,
      briefings: briefingsGerados,
    });

  } catch (error) {
    console.error('[ERRO briefing-cron]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function buscarReunioesProximas24h() {
  const agora = new Date();
  const em24h = new Date(agora.getTime() + 24 * 60 * 60 * 1000);

  const r = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
    body: JSON.stringify({
      filterGroups: [{
        filters: [
          { propertyName: 'dealstage', operator: 'EQ', value: process.env.HUBSPOT_STAGE_REUNIAO },
          { propertyName: 'closedate', operator: 'GTE', value: agora.toISOString() },
          { propertyName: 'closedate', operator: 'LTE', value: em24h.toISOString() },
        ]
      }],
      properties: ['dealname', 'dealstage', 'closedate', 'hs_next_step'],
      limit: 20,
    })
  });

  if (!r.ok) return [];
  const d = await r.json();

  return (d.results || []).map(deal => ({
    id: deal.id,
    lead_name: deal.properties.dealname?.split(' — ')[1] || deal.properties.dealname,
    company: deal.properties.dealname?.split(' — ')[0] || '',
    cargo: '',
    setor: '',
    data_reuniao: deal.properties.closedate || deal.properties.hs_next_step || 'A confirmar',
  }));
}

async function verificarBriefingGerado(dealId) {
  const r = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/notes`, {
    headers: { 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` }
  });
  if (!r.ok) return false;
  const d = await r.json();
  // Se tiver alguma nota associada, assume briefing gerado
  return (d.results || []).length > 0;
}

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'briefing-cron');
