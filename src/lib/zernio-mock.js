/**
 * zernio-mock.js — Mock data realista para la pestaña Zernio.
 *
 * Iteración 2: este archivo simula el backend antes de que exista la
 * Netlify Function de clasificación de DMs y las 4 tablas asociadas.
 *
 * Cuando aterrice el backend real (Hilo 2), `src/lib/api.js` expondrá
 * un `zernioApi` que devolverá la misma shape de objetos, y este mock
 * se desactiva sustituyendo el import en Zernio.jsx por la llamada API.
 *
 * Las 12 notifs pending son las del handoff de Claude Design (literal),
 * para preservar la fidelidad visual del diseño revisado. Los 25
 * históricos son los 7 del handoff + 18 generados con perfiles plausibles.
 */

// ───────────────────────────────────────────────────────────────────
// SEQUENCES (slugs / nombres / IDs reales de Zernio)
// ───────────────────────────────────────────────────────────────────

export const SEQUENCES = {
  "herm-onboarding": {
    slug: "herm-onboarding",
    name: "HERMANDAD · ONBOARDING",
    zernioId: "6a0afe4e47068aa92bb9c94a",
    intent: "hermandad",
  },
  "elite-call": {
    slug: "elite-call",
    name: "ÉLITE · CALL",
    zernioId: "6a0afe52fcb4a493cb039914",
    intent: "elite",
  },
  "general-welcome": {
    slug: "general-welcome",
    name: "GENERAL · WELCOME",
    zernioId: "6a0afe41fcb4a493cb039586",
    intent: "general",
  },
};

// ───────────────────────────────────────────────────────────────────
// EDGE FN HEALTH (estado actual de la Netlify Function clasificadora)
// ───────────────────────────────────────────────────────────────────

export const EDGE_HEALTH_OPERATIONAL = {
  state: "operational",
  lastProcessedAt: new Date(Date.now() - 2 * 60 * 1000),
  latencyMeanMs: 240,
  latencyP95Ms: 412,
  processedLast24h: 147,
  successRate: 0.986,
  retries: 2,
};

export const EDGE_HEALTH_DEGRADED = {
  state: "degraded",
  lastProcessedAt: new Date(Date.now() - 8 * 60 * 1000),
  latencyMeanMs: 1180,
  latencyP95Ms: 2640,
  processedLast24h: 143,
  successRate: 0.91,
  retries: 12,
};

export const EDGE_HEALTH_DOWN = {
  state: "down",
  lastProcessedAt: new Date(Date.now() - 22 * 60 * 1000),
  latencyMeanMs: 0,
  latencyP95Ms: 0,
  processedLast24h: 138,
  successRate: 0,
  retries: 7,
  downSinceMs: Date.now() - 22 * 60 * 1000,
};

// ───────────────────────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────────────────────

const MODEL = "claude-haiku-4.5";
const CLASSIFIER_VERSION = "classify-dm/v3.2";

function suggestedSequenceFor(intent) {
  if (intent === "hermandad") return "herm-onboarding";
  if (intent === "elite") return "elite-call";
  if (intent === "general") return "general-welcome";
  return null;
}

function makeNotif(over) {
  return {
    id: over.id,
    source: "instagram_dm",
    externalId: over.externalId || `ig_${over.id}`,
    receivedAt: over.receivedAt,
    contact: over.contact,
    dm: { text: over.dmText },
    classification: {
      intent: over.intent,
      temperature: over.temperature,
      confidence: over.confidence,
      suggestedSequence: suggestedSequenceFor(over.intent),
      tags: over.tags || [],
      reasoning: over.reasoning,
      model: MODEL,
      classifierVersion: CLASSIFIER_VERSION,
      latencyMs: over.latencyMs || 380,
    },
    state: over.state || "pending",
    decision: over.decision,
    contactHistory: over.contactHistory || [],
  };
}

// ───────────────────────────────────────────────────────────────────
// 12 NOTIFS PENDING (literal del handoff de Claude Design)
// ───────────────────────────────────────────────────────────────────

export const NOTIFS_PENDING = [
  makeNotif({
    id: "n01",
    receivedAt: new Date(Date.now() - 12 * 60 * 1000),
    contact: { handle: "@mar.ruiz_92", externalId: "ig_mar_ruiz_92", displayName: "Mar Ruiz", followerCount: 1200, location: "ES · MAD", avatarInitials: "MR" },
    dmText: "Soma llevo seis meses leyéndote. Esta semana he tomado decisiones que llevaba dos años postergando. Quiero entrar en la Hermandad cueste lo que cueste, dime cómo accedo.",
    intent: "hermandad",
    temperature: "hot",
    confidence: 92,
    tags: ["#decisión-tomada", "#urgencia-alta", "#lector-fiel"],
    reasoning: "Lleva seis meses como lectora, lo que indica fidelidad. Menciona explícitamente \"Hermandad\" y \"cueste lo que cueste\" — señal de intención compra-cierre. Lenguaje de decisión, no de exploración. Recomiendo enrolar inmediatamente.",
    latencyMs: 412,
    contactHistory: [
      { at: new Date(Date.now() - 12 * 60 * 1000), kind: "dm_classified", summary: "DM recibido · clasificado como Hermandad con 92% conf.", current: true },
      { at: new Date("2026-05-02T09:14:00"), kind: "dm_classified", summary: "DM previo · clasificado General, descartado por confianza baja (41%)." },
      { at: new Date("2026-04-14"), kind: "newsletter_subscribe", summary: "Suscrita a newsletter desde landing /hermandad." },
    ],
  }),
  makeNotif({
    id: "n02",
    receivedAt: new Date(Date.now() - 28 * 60 * 1000),
    contact: { handle: "@joseluis.fdez", externalId: "ig_jl_fdez", displayName: "José Luis Fernández", followerCount: 480, location: "ES · BCN", avatarInitials: "JL" },
    dmText: "He visto el último vídeo. Tengo una empresa de 12 personas facturando ~2M y siento que estoy en un techo. ¿Hay forma de trabajar contigo en algo serio?",
    intent: "elite",
    temperature: "warm",
    confidence: 78,
    tags: ["#founder", "#facturación-alta", "#consulta-seria"],
    reasoning: "Founder con empresa establecida (12 personas, 2M facturación). Tono ejecutivo, busca \"algo serio\". Perfil claro de Élite. Confianza media porque no menciona el producto explícitamente.",
    latencyMs: 388,
  }),
  makeNotif({
    id: "n03",
    receivedAt: new Date(Date.now() - 41 * 60 * 1000),
    contact: { handle: "@carla.guti", externalId: "ig_carla_guti", displayName: "Carla Gutiérrez", followerCount: 820, location: "ES · VAL", avatarInitials: "CG" },
    dmText: "Buenas, vi tu episodio sobre haters y me ha hecho clic algo gordo. Llevo tiempo siguiéndote, ¿la Hermandad sigue abierta?",
    intent: "hermandad",
    temperature: "warm",
    confidence: 87,
    tags: ["#impacto-emocional", "#hermandad-explícita"],
    reasoning: "Menciona Hermandad explícitamente y refiere a un episodio concreto. Lenguaje cálido pero todavía consultivo (\"sigue abierta\"), no de cierre. Apta para Hermandad con seguimiento.",
    latencyMs: 401,
  }),
  makeNotif({
    id: "n04",
    receivedAt: new Date(Date.now() - 64 * 60 * 1000),
    contact: { handle: "@daniel_psd", externalId: "ig_daniel_psd", displayName: "Daniel P.", followerCount: 95, location: "AR · BUE", avatarInitials: "DP" },
    dmText: "Eh hola, no sé muy bien cómo funciona esto. Te escucho hace poco pero me interesa lo que dices. ¿Qué tienes para empezar?",
    intent: "general",
    temperature: "cold",
    confidence: 64,
    tags: ["#primer-contacto", "#exploración"],
    reasoning: "Primer contacto, exploratorio. \"¿Qué tienes para empezar?\" señala entrada por la puerta general. Sin urgencia, sin perfil económico evidente.",
    latencyMs: 365,
  }),
  makeNotif({
    id: "n05",
    receivedAt: new Date(Date.now() - 82 * 60 * 1000),
    contact: { handle: "@victor.cabrera", externalId: "ig_victor_cabrera", displayName: "Víctor Cabrera", followerCount: 2400, location: "ES · MAD", avatarInitials: "VC" },
    dmText: "Tu vídeo sobre los 4M me ha removido. Llevo años con mi consultora y creo que necesito el nivel que ofreces en Élite. ¿Cuándo abre la próxima edición?",
    intent: "elite",
    temperature: "hot",
    confidence: 94,
    tags: ["#consultor", "#élite-explícita", "#listo-para-cerrar"],
    reasoning: "Consultor con experiencia. Menciona Élite por nombre. Pregunta operativa (\"cuándo abre\"), no exploratoria. Confianza alta, perfil económico evidente. Cierre probable.",
    latencyMs: 423,
  }),
  makeNotif({
    id: "n06",
    receivedAt: new Date(Date.now() - 135 * 60 * 1000),
    contact: { handle: "@fxtrader_pro", externalId: "ig_fxtrader_pro", displayName: "FX Trader Pro", followerCount: 80000, location: "—", avatarInitials: "FX" },
    dmText: "Hola Soma, quería proponerte una colaboración con mi canal de trading. Tengo 80k followers, podemos hacer algo juntos. Pásame tu media kit.",
    intent: "sininter",
    temperature: "cold",
    confidence: 89,
    tags: ["#colaboración", "#fuera-del-nicho"],
    reasoning: "Petición de colaboración cross-promocional desde nicho ajeno (trading). No es un lead, es un emisor. Descartar para sequence; responder humanamente si se quiere, opcional.",
    latencyMs: 295,
  }),
  makeNotif({
    id: "n07",
    receivedAt: new Date(Date.now() - 221 * 60 * 1000),
    contact: { handle: "@rocio.mendez", externalId: "ig_rocio_mendez", displayName: "Rocío Méndez", followerCount: 312, location: "ES · SEV", avatarInitials: "RM" },
    dmText: "Vi tu reel del honor. Me pregunto si tienes algún grupo donde gente esté trabajándose en serio. Tengo curiosidad por la Hermandad pero no sé si soy \"el perfil\".",
    intent: "hermandad",
    temperature: "cold",
    confidence: 71,
    tags: ["#duda-perfil", "#exploración-seria"],
    reasoning: "Curiosidad legítima por Hermandad pero con autoduda sobre encaje. Buena para Hermandad con sequence que resuelva el \"no sé si soy el perfil\" en los primeros mensajes.",
    latencyMs: 392,
  }),
  makeNotif({
    id: "n08",
    receivedAt: new Date(Date.now() - 242 * 60 * 1000),
    contact: { handle: "@andres.toscano", externalId: "ig_andres_toscano", displayName: "Andrés Toscano", followerCount: 156, location: "CO · BOG", avatarInitials: "AT" },
    dmText: "Llevo dos semanas escuchándote en spotify cada mañana. Me cambia el día. Quería saber si tienes una newsletter o algo donde no me pierda nada.",
    intent: "general",
    temperature: "warm",
    confidence: 91,
    tags: ["#oyente-asiduo", "#newsletter"],
    reasoning: "Oyente de podcast de 2 semanas, alta intensidad de consumo (\"cada mañana\"). Pide newsletter explícitamente. Sequence General · Welcome es exactamente para este perfil.",
    latencyMs: 348,
  }),
  makeNotif({
    id: "n09",
    receivedAt: new Date(Date.now() - 318 * 60 * 1000),
    contact: { handle: "@p.sanmartin", externalId: "ig_p_sanmartin", displayName: "Pablo Sanmartín", followerCount: 1900, location: "ES · BCN", avatarInitials: "PS" },
    dmText: "Soy CEO de una agencia (8 personas, 1.2M). He visto que tienes algo para founders. ¿Cómo se entra?",
    intent: "elite",
    temperature: "warm",
    confidence: 88,
    tags: ["#founder", "#cierre-cercano"],
    reasoning: "CEO de agencia de tamaño medio. Pregunta operativa de acceso. Perfil claro de Élite, falta solo el último empujón.",
    latencyMs: 405,
  }),
  makeNotif({
    id: "n10",
    receivedAt: new Date(Date.now() - 407 * 60 * 1000),
    contact: { handle: "@nuria_trav", externalId: "ig_nuria_trav", displayName: "Nuria Travieso", followerCount: 640, location: "ES · MAD", avatarInitials: "NT" },
    dmText: "Hermano necesito esto YA. Llevo tres años escondida, hoy es el día. Quiero entrar en Hermandad. Hazme el ingreso.",
    intent: "hermandad",
    temperature: "hot",
    confidence: 96,
    tags: ["#cierre-inminente", "#urgencia-máxima"],
    reasoning: "Cierre inminente. Lenguaje de decisión absoluta (\"necesito esto YA\", \"hazme el ingreso\"). Confianza máxima. Enrolar y dar acceso directo.",
    latencyMs: 358,
  }),
  makeNotif({
    id: "n11",
    receivedAt: new Date("2026-05-18T21:14:00"),
    contact: { handle: "@elena_lapeira", externalId: "ig_elena_lapeira", displayName: "Elena Lapeira", followerCount: 84, location: "ES · MAD", avatarInitials: "EL" },
    dmText: "Hola Soma, soy la prima de Marta. Nos vemos en Navidades. Te sigo con orgullo. Mucha fuerza con todo lo que estás haciendo.",
    intent: "sininter",
    temperature: "warm",
    confidence: 73,
    tags: ["#familiar", "#mensaje-cariño"],
    reasoning: "Mensaje familiar, no comercial. Etiquetar como Familiar y no enrolar en ninguna sequence.",
    latencyMs: 312,
  }),
  makeNotif({
    id: "n12",
    receivedAt: new Date("2026-05-18T19:02:00"),
    contact: { handle: "@yago.m", externalId: "ig_yago_m", displayName: "Yago M.", followerCount: 47, location: "ES · GAL", avatarInitials: "YM" },
    dmText: "Te conocí ayer por un amigo. Aún no sé bien quién eres pero el corto que vi me ha dejado pensando. ¿Por dónde se empieza contigo?",
    intent: "general",
    temperature: "cold",
    confidence: 58,
    tags: ["#recién-llegado", "#referido"],
    reasoning: "Recién llegado por referido. Sin contexto suficiente para una clasificación de alta confianza. General · Welcome es el camino seguro.",
    latencyMs: 421,
  }),
];

// ───────────────────────────────────────────────────────────────────
// HISTÓRICOS (25 entradas: 7 del handoff + 18 generados)
// ───────────────────────────────────────────────────────────────────

function makeDecided(over) {
  return makeNotif({
    ...over,
    state: over.decisionType === "enroll" ? "enrolled" :
           over.decisionType === "discard" ? "discarded" :
           over.decisionType === "tag" ? "tagged" : "promoted",
    decision: {
      type: over.decisionType,
      sequenceSlug: over.sequenceSlug,
      discardReason: over.discardReason,
      tagApplied: over.tagApplied,
      decidedAt: over.decidedAt || over.receivedAt,
      decidedBy: "soma",
      timeToDecideSec: over.timeToDecideSec || 10,
    },
  });
}

export const NOTIFS_DECIDED = [
  // Las 7 del handoff
  makeDecided({
    id: "h01",
    receivedAt: new Date("2026-05-19T11:42:00"),
    contact: { handle: "@silvia.guerra", avatarInitials: "SG", followerCount: 940, location: "ES · MAD" },
    dmText: "Quiero entrar en Hermandad. Llevo tiempo, ahora tengo el dinero y la cabeza. Dime cómo.",
    intent: "hermandad", temperature: "hot", confidence: 95,
    reasoning: "Lenguaje de cierre directo. Mención explícita + condiciones de compra (\"tengo el dinero\"). Enrolar.",
    decisionType: "enroll", sequenceSlug: "herm-onboarding", timeToDecideSec: 14,
  }),
  makeDecided({
    id: "h02",
    receivedAt: new Date("2026-05-19T10:28:00"),
    contact: { handle: "@martin.cuevas", avatarInitials: "MC", followerCount: 3200, location: "ES · MAD" },
    dmText: "Founder de SaaS, ARR 3.4M, buscando algo que me saque del techo operativo. Élite?",
    intent: "elite", temperature: "hot", confidence: 93,
    reasoning: "Founder SaaS con ARR alto. Menciona Élite. Cierre rápido.",
    decisionType: "enroll", sequenceSlug: "elite-call", timeToDecideSec: 22,
  }),
  makeDecided({
    id: "h03",
    receivedAt: new Date("2026-05-19T09:14:00"),
    contact: { handle: "@spam.bot_404", avatarInitials: "SP", followerCount: 12, location: "—" },
    dmText: "🚀🚀 Hola guapo te ofrezco gestión de redes 100€/mes resultados garantizados click aquí…",
    intent: "sininter", temperature: "cold", confidence: 98,
    reasoning: "Spam clarísimo. Emojis comerciales + oferta no solicitada + link sospechoso.",
    decisionType: "discard", discardReason: "SCAM", timeToDecideSec: 3,
  }),
  makeDecided({
    id: "h04",
    receivedAt: new Date("2026-05-18T18:41:00"),
    contact: { handle: "@ines.barros", avatarInitials: "IB", followerCount: 270, location: "ES · VAL" },
    dmText: "Acabo de descubrirte, qué bestia. ¿Tienes algo para empezar de cero?",
    intent: "general", temperature: "warm", confidence: 86,
    reasoning: "Primer contacto entusiasta. General · Welcome es la entrada natural.",
    decisionType: "enroll", sequenceSlug: "general-welcome", timeToDecideSec: 9,
  }),
  makeDecided({
    id: "h05",
    receivedAt: new Date("2026-05-18T16:02:00"),
    contact: { handle: "@fer.terron", avatarInitials: "FT", followerCount: 180, location: "ES · MAD" },
    dmText: "Soma soy tu amigo del cole, llevo años queriendo escribirte. Un abrazo grande.",
    intent: "sininter", temperature: "warm", confidence: 81,
    reasoning: "Contacto personal pre-existente (amigo del cole). No es lead, es vínculo.",
    decisionType: "tag", tagApplied: "AMIGO", timeToDecideSec: 11,
  }),
  makeDecided({
    id: "h06",
    receivedAt: new Date("2026-05-18T14:18:00"),
    contact: { handle: "@cris.bujan", avatarInitials: "CB", followerCount: 510, location: "ES · BCN" },
    dmText: "Hermano me decido. Hermandad. Hoy. ¿Pago a dónde?",
    intent: "hermandad", temperature: "hot", confidence: 97,
    reasoning: "Cierre absoluto. Sin ambigüedad. Enrolar y enviar pasarela de pago.",
    decisionType: "enroll", sequenceSlug: "herm-onboarding", timeToDecideSec: 4,
  }),
  makeDecided({
    id: "h07",
    receivedAt: new Date("2026-05-18T11:09:00"),
    contact: { handle: "@juan.cliente_71", avatarInitials: "JC", followerCount: 220, location: "ES · MAD" },
    dmText: "Hola, soy de Hermandad cohorte 04. Sigo dándole. Solo quería decirte gracias por el último drop.",
    intent: "sininter", temperature: "warm", confidence: 88,
    reasoning: "Cliente existente de Hermandad. Mensaje de gratitud, no de compra. Etiquetar.",
    decisionType: "tag", tagApplied: "CLIENTE EXISTENTE", timeToDecideSec: 7,
  }),

  // 18 generados (variaciones plausibles)
  makeDecided({
    id: "h08", receivedAt: new Date("2026-05-18T09:32:00"),
    contact: { handle: "@l.rojo", avatarInitials: "LR", followerCount: 410 },
    dmText: "Vi tu vídeo del fin del mundo del coach. Me he sentido pillado. ¿Cómo se entra a la Hermandad?",
    intent: "hermandad", temperature: "warm", confidence: 89,
    reasoning: "Conexión emocional + pregunta directa de acceso.",
    decisionType: "enroll", sequenceSlug: "herm-onboarding", timeToDecideSec: 8,
  }),
  makeDecided({
    id: "h09", receivedAt: new Date("2026-05-17T22:11:00"),
    contact: { handle: "@m.santos", avatarInitials: "MS", followerCount: 78 },
    dmText: "Hermano gracias por tu trabajo. Sigo escuchándote en el coche cada día.",
    intent: "sininter", temperature: "warm", confidence: 79,
    reasoning: "Gratitud sin pregunta. No es lead.",
    decisionType: "discard", discardReason: "FAN MESSAGE", timeToDecideSec: 5,
  }),
  makeDecided({
    id: "h10", receivedAt: new Date("2026-05-17T19:45:00"),
    contact: { handle: "@d.iriarte", avatarInitials: "DI", followerCount: 1840 },
    dmText: "Tengo una empresa industrial pequeña (5M). Estoy mirando Élite. ¿Cómo se aplica?",
    intent: "elite", temperature: "hot", confidence: 92,
    reasoning: "Empresa industrial 5M, pregunta operativa. Élite directo.",
    decisionType: "enroll", sequenceSlug: "elite-call", timeToDecideSec: 12,
  }),
  makeDecided({
    id: "h11", receivedAt: new Date("2026-05-17T16:20:00"),
    contact: { handle: "@oferta.crypto_x", avatarInitials: "OC", followerCount: 22000 },
    dmText: "💎 Inversiones cripto 10X garantizado. Pásame DNI para activar tu wallet.",
    intent: "sininter", temperature: "cold", confidence: 99,
    reasoning: "Scam de manual.",
    decisionType: "discard", discardReason: "SCAM", timeToDecideSec: 2,
  }),
  makeDecided({
    id: "h12", receivedAt: new Date("2026-05-17T13:55:00"),
    contact: { handle: "@p.amezcua", avatarInitials: "PA", followerCount: 290 },
    dmText: "Hola Soma, llevo poco escuchándote pero algo me ha tocado. ¿Por dónde empiezo?",
    intent: "general", temperature: "warm", confidence: 85,
    reasoning: "Primer contacto cálido. General.",
    decisionType: "enroll", sequenceSlug: "general-welcome", timeToDecideSec: 8,
  }),
  makeDecided({
    id: "h13", receivedAt: new Date("2026-05-17T11:02:00"),
    contact: { handle: "@t.lopez_arq", avatarInitials: "TL", followerCount: 950 },
    dmText: "Arquitecto independiente, facturo 180k. Crees que Hermandad encaja conmigo?",
    intent: "hermandad", temperature: "warm", confidence: 83,
    reasoning: "Profesional liberal con duda de encaje. Hermandad acoge.",
    decisionType: "enroll", sequenceSlug: "herm-onboarding", timeToDecideSec: 17,
  }),
  makeDecided({
    id: "h14", receivedAt: new Date("2026-05-16T20:18:00"),
    contact: { handle: "@ana_p", avatarInitials: "AP", followerCount: 65 },
    dmText: "Soma soy tu vecina del 4ºA jajaja qué loco verte por aquí",
    intent: "sininter", temperature: "warm", confidence: 84,
    reasoning: "Contacto del barrio. No lead.",
    decisionType: "tag", tagApplied: "AMIGO", timeToDecideSec: 6,
  }),
  makeDecided({
    id: "h15", receivedAt: new Date("2026-05-16T17:42:00"),
    contact: { handle: "@k.molina", avatarInitials: "KM", followerCount: 1100 },
    dmText: "Después de cuatro años en consultoría me siento vacío. Necesito algo. ¿Hermandad?",
    intent: "hermandad", temperature: "warm", confidence: 88,
    reasoning: "Decisión madurada. Hermandad.",
    decisionType: "enroll", sequenceSlug: "herm-onboarding", timeToDecideSec: 13,
  }),
  makeDecided({
    id: "h16", receivedAt: new Date("2026-05-16T15:00:00"),
    contact: { handle: "@b.ferro", avatarInitials: "BF", followerCount: 4200 },
    dmText: "Founder Series-B. Élite. Necesito acelerar la siguiente fase.",
    intent: "elite", temperature: "hot", confidence: 95,
    reasoning: "Founder Series-B, máxima señal económica. Élite cerrar.",
    decisionType: "enroll", sequenceSlug: "elite-call", timeToDecideSec: 6,
  }),
  makeDecided({
    id: "h17", receivedAt: new Date("2026-05-16T12:34:00"),
    contact: { handle: "@bot_marketing", avatarInitials: "BM", followerCount: 51000 },
    dmText: "Hola, podemos hacerte crecer 10K seguidores reales en 30 días. Click aquí.",
    intent: "sininter", temperature: "cold", confidence: 99,
    reasoning: "Bot de marketing.",
    decisionType: "discard", discardReason: "SCAM", timeToDecideSec: 1,
  }),
  makeDecided({
    id: "h18", receivedAt: new Date("2026-05-16T10:11:00"),
    contact: { handle: "@s.medero", avatarInitials: "SM", followerCount: 380 },
    dmText: "Vi tu última story. Quiero pertenecer a algo más grande que mi día a día. ¿Hermandad?",
    intent: "hermandad", temperature: "warm", confidence: 86,
    reasoning: "Necesidad de pertenencia explícita. Hermandad.",
    decisionType: "enroll", sequenceSlug: "herm-onboarding", timeToDecideSec: 10,
  }),
  makeDecided({
    id: "h19", receivedAt: new Date("2026-05-15T19:25:00"),
    contact: { handle: "@i.calvo_md", avatarInitials: "IC", followerCount: 1450 },
    dmText: "Médico, propietario de clínica privada. Élite parece encajar. ¿Próximo grupo?",
    intent: "elite", temperature: "warm", confidence: 87,
    reasoning: "Profesional de alto ticket. Élite.",
    decisionType: "enroll", sequenceSlug: "elite-call", timeToDecideSec: 11,
  }),
  makeDecided({
    id: "h20", receivedAt: new Date("2026-05-15T16:50:00"),
    contact: { handle: "@j.romero", avatarInitials: "JR", followerCount: 130 },
    dmText: "Soma. Cliente Hermandad cohorte 02. Solo quería decir gracias.",
    intent: "sininter", temperature: "warm", confidence: 91,
    reasoning: "Cliente existente, gratitud.",
    decisionType: "tag", tagApplied: "CLIENTE EXISTENTE", timeToDecideSec: 4,
  }),
  makeDecided({
    id: "h21", receivedAt: new Date("2026-05-15T14:08:00"),
    contact: { handle: "@n.rosales", avatarInitials: "NR", followerCount: 76 },
    dmText: "Acabo de escuchar tu episodio sobre traición. He llorado. Gracias.",
    intent: "general", temperature: "cold", confidence: 68,
    reasoning: "Impacto emocional, sin pregunta. General de bajo voltaje.",
    decisionType: "discard", discardReason: "FAN MESSAGE", timeToDecideSec: 6,
  }),
  makeDecided({
    id: "h22", receivedAt: new Date("2026-05-15T11:22:00"),
    contact: { handle: "@v.suarez", avatarInitials: "VS", followerCount: 540 },
    dmText: "Hola Soma, abogada independiente. Llevo dos años escuchándote. Hermandad?",
    intent: "hermandad", temperature: "warm", confidence: 89,
    reasoning: "Dos años de fidelidad + pregunta directa.",
    decisionType: "enroll", sequenceSlug: "herm-onboarding", timeToDecideSec: 9,
  }),
  makeDecided({
    id: "h23", receivedAt: new Date("2026-05-14T22:11:00"),
    contact: { handle: "@g.mendez", avatarInitials: "GM", followerCount: 92 },
    dmText: "Te conocí por casualidad. ¿Tienes podcast?",
    intent: "general", temperature: "cold", confidence: 74,
    reasoning: "Curiosidad inicial.",
    decisionType: "enroll", sequenceSlug: "general-welcome", timeToDecideSec: 7,
  }),
  makeDecided({
    id: "h24", receivedAt: new Date("2026-05-14T18:34:00"),
    contact: { handle: "@r.beltran_ceo", avatarInitials: "RB", followerCount: 2300 },
    dmText: "CEO empresa familiar, 7M. Vi Élite. Cómo se aplica.",
    intent: "elite", temperature: "warm", confidence: 90,
    reasoning: "CEO empresa familiar consolidada. Élite.",
    decisionType: "enroll", sequenceSlug: "elite-call", timeToDecideSec: 8,
  }),
  makeDecided({
    id: "h25", receivedAt: new Date("2026-05-14T15:50:00"),
    contact: { handle: "@e.duran", avatarInitials: "ED", followerCount: 410 },
    dmText: "Quiero salir del modo supervivencia que llevas dos meses describiendo en tus correos. Hermandad?",
    intent: "hermandad", temperature: "hot", confidence: 93,
    reasoning: "Apela al lenguaje específico de la marca. Cierre cercano.",
    decisionType: "enroll", sequenceSlug: "herm-onboarding", timeToDecideSec: 5,
  }),
];

// El histórico total simulado (la pill marca este número aunque sólo
// listemos los 25 con detalle; en backend real serían 89).
export const HISTORICO_TOTAL_COUNT = 89;
