/**
 * zernio-classify.ts — Clasifica un DM de Instagram usando Claude Haiku 4.5.
 *
 * Devuelve un objeto con la shape que espera el schema SQL:
 *   {
 *     interes_sugerido: 'int-hermandad' | 'int-elite' | 'int-general'
 *                     | 'sin-interes' | 'requiere-revision',
 *     temperatura:      'frio' | 'tibio' | 'caliente',
 *     confianza:        number (0..1),
 *     sequence_sugerida_id: string | null,
 *     tags_sugeridos:   string[],
 *     razonamiento:     string,
 *     modelo_usado:     string,
 *     latency_ms:       number,
 *   }
 *
 * El system prompt está pensado para iterar: cuando Soma vea clasificaciones
 * en producción que no le encajen, ajustamos el prompt y se redespliega.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `Eres el clasificador de DMs de Imperio Indomable, una plataforma de desarrollo personal masculino fundada por Soma Alcázar. Tu trabajo es leer cada DM entrante de Instagram y devolver una clasificación estructurada.

## Productos de Imperio Indomable

- **La Hermandad**: comunidad online de hombres trabajando su carácter (sacrificio, honor, dominio personal). Precio medio (~600€). Acceso por decisión propia del prospecto, sin filtro económico fuerte. Para personas que buscan transformación interior y pertenencia a un grupo de hombres serios.
- **Indomables Élite**: programa avanzado para founders, CEOs, dueños de empresas o profesionales liberales con facturación alta (>500K€/año). Mucho más caro y exclusivo (>5K€). Hay filtro de perfil económico. Lenguaje ejecutivo, busca consultoría / mastermind, mencionan "techo", "siguiente nivel", "necesito acelerar".
- **General**: cualquier persona que muestra interés en el contenido sin un encaje claro con Hermandad o Élite. Primer contacto, exploratorio, pide newsletter o podcast.

## Output

Devuelve **SOLO JSON** sin markdown ni texto adicional, con esta estructura exacta:

\`\`\`json
{
  "interes_sugerido": "int-hermandad" | "int-elite" | "int-general" | "sin-interes" | "requiere-revision",
  "temperatura": "frio" | "tibio" | "caliente",
  "confianza": 0.85,
  "sequence_sugerida_id": "herm-onboarding" | "elite-call" | "general-welcome" | null,
  "tags_sugeridos": ["#tag-1", "#tag-2"],
  "razonamiento": "Una o dos frases explicando la clasificación."
}
\`\`\`

## Criterios

### interes_sugerido
- **int-hermandad**: menciona Hermandad explícitamente, busca grupo / comunidad / pertenencia, habla de transformación interior, sacrificio, dominio personal. Lenguaje emocional o identitario.
- **int-elite**: founder, CEO, dueño de empresa o profesional liberal con perfil económico alto. Lenguaje ejecutivo. Menciona Élite, "techo operativo", "siguiente nivel" en contexto empresarial. Habla de facturación, empleados, escala.
- **int-general**: interés genuino en el contenido sin perfil claro. Primer contacto, exploratorio, pide newsletter / podcast / "por dónde empiezo".
- **sin-interes**: NO es lead. Aplica a: colaboraciones cross-promocionales, spam, mensajes personales (familiares, amigos, vecinos), clientes existentes saludando, fans agradeciendo sin pregunta, mensajes que no piden nada concreto.
- **requiere-revision**: el mensaje es ambiguo, mal escrito, en otro idioma, o sin señales claras para clasificar. Si dudas mucho entre dos categorías, mejor esta.

### temperatura
- **caliente**: lenguaje de decisión, urgencia, listo para comprar. "Cómo entro YA", "dime cómo pago", "necesito esto hoy", "hazme el ingreso".
- **tibio**: interés claro pero exploratorio. Pregunta "cómo funciona", "qué tienes para X", "cuándo abre la próxima edición".
- **frio**: curiosidad inicial sin urgencia. Recién descubierto, sin pregunta clara, exploratorio suave.

### confianza (0..1)
- **0.90+**: señales muy claras (palabras explícitas del producto, perfil bien definido).
- **0.70-0.89**: señales claras pero algún elemento de duda.
- **0.50-0.69**: lectura razonable pero podría ser de varias formas.
- **<0.50**: ambiguo, mejor revisión humana. Usa "requiere-revision" como interés.

### sequence_sugerida_id
Solo si interes_sugerido es int-hermandad, int-elite o int-general:
- int-hermandad → "herm-onboarding"
- int-elite → "elite-call"
- int-general → "general-welcome"

Si interes es sin-interes o requiere-revision → null.

### tags_sugeridos
Array de tags relevantes con # delante. Útiles:
- Comerciales: #cierre-cercano, #urgencia-alta, #decisión-tomada, #cierre-inminente
- Perfil: #founder, #ceo, #consultor, #profesional-liberal, #freelance
- Estado: #primer-contacto, #lector-fiel, #oyente-asiduo, #referido
- Especial: #cliente-existente, #scam, #colaboración, #familiar, #amigo, #fan-message
- Emocional: #impacto-emocional, #necesidad-pertenencia, #duda-perfil

Genera los que apliquen, de 1 a 5 tags máximo.

### razonamiento
Una o dos frases explicando por qué clasificas así. Sé directo y operativo: el lector es Soma, que decidirá en 5 segundos. No expliques lo obvio.

## Importante
- **SOLO JSON**. Nada de markdown, nada de texto antes o después.
- Si el DM está vacío o es solo emojis sin contenido, devuelve interes_sugerido = "requiere-revision" con confianza < 0.5.
- Si dudas entre dos categorías, baja la confianza.
- Los productos pueden ser mencionados con variantes ("hermandad", "la hermandad", "elite", "los élite", "indomables"). Detéctalos.`;

const ALLOWED_INTENTS = new Set([
  "int-hermandad",
  "int-elite",
  "int-general",
  "sin-interes",
  "requiere-revision",
]);

const ALLOWED_TEMPS = new Set(["frio", "tibio", "caliente"]);

const ALLOWED_SEQUENCES = new Set([
  "herm-onboarding",
  "elite-call",
  "general-welcome",
]);

export type Classification = {
  interes_sugerido: string;
  temperatura: string;
  confianza: number;
  sequence_sugerida_id: string | null;
  tags_sugeridos: string[];
  razonamiento: string;
  modelo_usado: string;
  latency_ms: number;
};

export async function classifyDM(opts: {
  dmText: string;
  contactHandle?: string;
  contactDisplayName?: string;
  apiKey: string;
}): Promise<Classification> {
  const { dmText, contactHandle, contactDisplayName, apiKey } = opts;

  const userMessage =
    `DM recibido en Instagram${contactHandle ? ` de ${contactHandle}` : ""}` +
    `${contactDisplayName ? ` (${contactDisplayName})` : ""}:\n\n` +
    `"${dmText}"\n\n` +
    `Clasifica.`;

  const t0 = Date.now();

  const resp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  const latency_ms = Date.now() - t0;

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "(no body)");
    throw new Error(
      `Anthropic API error ${resp.status}: ${errText.slice(0, 300)}`,
    );
  }

  const body = (await resp.json()) as any;
  const textBlock = body?.content?.find((b: any) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Anthropic response without text block");
  }

  // El modelo a veces envuelve en ```json ... ``` aunque le pidamos solo JSON.
  // Toleramos ambos casos.
  const raw = String(textBlock.text).trim();
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Anthropic returned invalid JSON: ${cleaned.slice(0, 300)}`,
    );
  }

  // Validación defensiva: si el modelo se sale del enum, normalizamos a
  // 'requiere-revision' con confianza forzada baja para que entre por la
  // ruta humana.
  const interes = ALLOWED_INTENTS.has(parsed.interes_sugerido)
    ? parsed.interes_sugerido
    : "requiere-revision";

  const temperatura = ALLOWED_TEMPS.has(parsed.temperatura)
    ? parsed.temperatura
    : "tibio";

  let confianza = Number(parsed.confianza);
  if (!Number.isFinite(confianza)) confianza = 0;
  confianza = Math.max(0, Math.min(1, confianza));

  // Si el interés cayó a "requiere-revision" por enum inválido, forzar
  // confianza < 0.5 para que el resto del pipeline trate como baja conf.
  if (interes === "requiere-revision" && confianza >= 0.5) {
    confianza = 0.49;
  }

  let sequence = parsed.sequence_sugerida_id;
  if (sequence === undefined || sequence === "") sequence = null;
  if (sequence !== null && !ALLOWED_SEQUENCES.has(sequence)) sequence = null;

  // Si no hay interés vendible, no debería haber sequence.
  if (interes === "sin-interes" || interes === "requiere-revision") {
    sequence = null;
  }

  const tags = Array.isArray(parsed.tags_sugeridos)
    ? parsed.tags_sugeridos
        .filter((t: any) => typeof t === "string" && t.length > 0)
        .slice(0, 8)
    : [];

  const razonamiento =
    typeof parsed.razonamiento === "string" ? parsed.razonamiento : "";

  return {
    interes_sugerido: interes,
    temperatura,
    confianza,
    sequence_sugerida_id: sequence,
    tags_sugeridos: tags,
    razonamiento,
    modelo_usado: MODEL,
    latency_ms,
  };
}
