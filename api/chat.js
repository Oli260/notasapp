const GROQ_API_URL = 'https://api.groq.com/openai/v1/responses';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEU;
  if (!apiKey) {
    return res.status(500).json({ error: 'No hay una clave de Groq configurada. Añade GROQ_API_KEY al entorno.' });
  }

  let body;

  try {
    body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
  } catch (error) {
    return res.status(400).json({ error: 'Cuerpo inválido' });
  }

  const { question, notes } = body || {};

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Pregunta requerida' });
  }

  const noteText = Array.isArray(notes)
    ? notes
        .map((note, index) => `Nota ${index + 1}: ${note.title || 'Sin título'}\nCategoría: ${note.category || 'sin categoría'}\nContenido: ${note.content || ''}`)
        .join('\n\n')
    : 'No hay notas disponibles.';

  const prompt = `Eres un asistente que responde preguntas usando exclusivamente la información disponible en las notas del usuario.\n\nNotas:\n${noteText}\n\nPregunta:\n${question}\n\nResponde de forma clara y concisa, cita los datos de las notas cuando sea posible. Si no hay suficiente información, di que no está claro en las notas.`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        input: prompt
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText || 'Error desde Groq' });
    }

    const data = await response.json();
    const answer = data.output_text || data?.output?.[0]?.content?.[0]?.text || data?.choices?.[0]?.message?.content || null;

    return res.status(200).json({ answer: answer || 'Groq no devolvió una respuesta.' });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Error interno en servidor' });
  }
};
