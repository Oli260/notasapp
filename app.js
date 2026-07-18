// Estado inicial de la app.
// Se intenta guardar en Supabase y se respalda en localStorage para evitar errores.
const SUPABASE_URL = 'https://rczqmuedddwpswyxkyea.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_A3SfDiwPNpAMKGcWfP1UUg_TYRBE_eB';
const STORAGE_KEY = 'notes-app-data';
const TABLE_CANDIDATES = ['notas', 'nota'];
let activeTableName = 'notas';

const supabaseClient = (() => {
  if (typeof supabase !== 'undefined' && supabase?.createClient) {
    return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  if (typeof window !== 'undefined' && window.supabase?.createClient) {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  return null;
})();

let realtimeChannel = null;
let pollingTimer = null;
const POLLING_INTERVAL_MS = 3000;
let notes = [];
let editingId = null;

// Referencias a elementos del DOM.
const notesGrid = document.getElementById('notes-grid');
const modalToggle = document.getElementById('modal-toggle');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelNoteBtn = document.getElementById('cancel-note-btn');
const noteForm = document.getElementById('note-form');
const syncStatus = document.getElementById('sync-status');
const modalTitle = document.getElementById('modal-title');
const modalSubtitle = document.querySelector('.modal-sub');
const noteIdInput = noteForm.querySelector('input[name="note-id"]');
const titleInput = noteForm.querySelector('input[name="title"]');
const categoryInputs = noteForm.querySelectorAll('input[name="category"]');
const contentInput = noteForm.querySelector('textarea[name="content"]');
const chatForm = document.getElementById('chat-form');
const chatQuestionInput = document.getElementById('chat-question');
const chatMessages = document.getElementById('chat-messages');
function getDefaultNotes() {
  return [
    {
      id: crypto.randomUUID(),
      title: 'Comprar cascos talla M',
      category: 'trabajo',
      content: 'Son los que más se venden. Pedir reposición al proveedor.',
      createdAt: 'Hoy'
    },
    {
      id: crypto.randomUUID(),
      title: 'Grabar episodio del podcast',
      category: 'ideas',
      content: 'Tema: cómo elegir tu primer casco sin morir en el intento.',
      createdAt: 'Ayer'
    },
    {
      id: crypto.randomUUID(),
      title: 'Idea para la clase',
      category: 'personal',
      content: 'Apagar el CSS en vivo y que vean los huesos del HTML.',
      createdAt: 'Lunes'
    }
  ];
}

function readLocalNotes() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;

  try {
    return JSON.parse(saved);
  } catch (error) {
    console.error('No se pudieron leer las notas guardadas localmente:', error);
    return null;
  }
}

function persistLocalNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function serializeNoteForSupabase(note) {
  return {
    id: note.id,
    titulo: note.title,
    contenido: JSON.stringify({
      content: note.content,
      category: note.category || 'trabajo'
    }),
    creada_en: new Date().toISOString(),
    modificada_en: new Date().toISOString()
  };
}

function mapNoteFromSupabase(row) {
  let content = '';
  let category = 'trabajo';

  try {
    const parsed = JSON.parse(row.contenido || '{}');
    if (typeof parsed === 'object' && parsed !== null) {
      content = parsed.content || '';
      category = parsed.category || 'trabajo';
    }
  } catch (error) {
    content = row.contenido || '';
  }

  return {
    id: row.id,
    title: row.titulo || '',
    category,
    content,
    createdAt: row.creada_en || 'Ahora'
  };
}

async function resolveActiveTableName() {
  for (const candidate of TABLE_CANDIDATES) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${candidate}?select=id&limit=1`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        return candidate;
      }
    } catch (error) {
      // Se intenta con la siguiente opción.
    }
  }

  return null;
}

function setSyncStatus(message) {
  if (syncStatus) {
    syncStatus.textContent = message;
  }
}

function applyRealtimeChange(row, eventType) {
  const note = mapNoteFromSupabase(row);

  if (eventType === 'INSERT') {
    notes = [note, ...notes.filter((item) => item.id !== note.id)];
  } else if (eventType === 'UPDATE') {
    notes = notes.map((item) => (item.id === note.id ? note : item));
    if (!notes.some((item) => item.id === note.id)) {
      notes.unshift(note);
    }
  } else if (eventType === 'DELETE') {
    notes = notes.filter((item) => item.id !== note.id);
  } else {
    return;
  }

  persistLocalNotes();
  renderNotes();
}

function handleRealtimeEvent(payload) {
  console.log('Realtime event payload:', payload);
  const row = payload.record ?? payload.new ?? payload.old;
  if (!row) return;
  const eventType = payload.eventType || payload.type || payload.event;
  console.log('Realtime event type:', eventType, 'row:', row);
  applyRealtimeChange(row, eventType);
}

function subscribeRealtime() {
  if (!supabaseClient || !activeTableName) {
    console.warn('Realtime no disponible: falta cliente o tabla activa');
    setSyncStatus('Realtime no disponible, usando sondeo de respaldo');
    return false;
  }

  try {
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }

    const channel = supabaseClient.channel(`realtime-${activeTableName}`);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: activeTableName }, handleRealtimeEvent);
    channel.subscribe();

    realtimeChannel = channel;
    console.log('Supabase Realtime iniciado en tabla:', activeTableName);
    setSyncStatus('Conectando a Supabase Realtime...');
    channel.on('broadcast', { event: '*', schema: 'public', table: activeTableName }, (payload) => {
      console.log('Broadcast event:', payload);
    });
    return true;
  } catch (error) {
    console.warn('Error al suscribir Realtime:', error);
    realtimeChannel = null;
    setSyncStatus('Realtime falló, usando sondeo de respaldo');
    return false;
  }
}

async function fetchNotesFromSupabase() {
  if (!activeTableName) {
    activeTableName = await resolveActiveTableName();
  }

  if (!activeTableName) {
    throw new Error('No se encontró una tabla disponible en Supabase');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${activeTableName}?select=id,titulo,contenido,creada_en,modificada_en&order=creada_en.desc,modificada_en.desc`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return (data || []).map(mapNoteFromSupabase);
}

function startPollingNotes() {
  if (pollingTimer) return;

  async function poll() {
    try {
      const latestNotes = await fetchNotesFromSupabase();
      const hasChanges = JSON.stringify(notes) !== JSON.stringify(latestNotes);
      if (hasChanges) {
        notes = latestNotes;
        persistLocalNotes();
        renderNotes();
        console.log('Notas actualizadas por sondeo en segundo plano');
      }
    } catch (error) {
      console.warn('Fallo el sondeo de notas:', error);
    }
  }

  poll();
  pollingTimer = setInterval(poll, POLLING_INTERVAL_MS);
  setSyncStatus('Sondeo activo: actualizando cada 3 segundos');
}

// Cargar datos desde Supabase y, si falla, desde localStorage.
async function loadNotes() {
  try {
    notes = await fetchNotesFromSupabase();
    persistLocalNotes();
  } catch (error) {
    console.warn('Carga inicial desde Supabase falló, usando local o valores por defecto:', error);
    const localNotes = readLocalNotes();
    notes = Array.isArray(localNotes) && localNotes.length ? localNotes : getDefaultNotes();
    persistLocalNotes();
  }

  renderNotes();
}

function initSyncStatus() {
  setSyncStatus('Iniciando sincronización...');
}

async function saveNote(note) {
  try {
    if (!activeTableName) {
      activeTableName = await resolveActiveTableName();
    }

    if (!activeTableName) {
      throw new Error('No se encontró una tabla disponible en Supabase');
    }

    const payload = serializeNoteForSupabase(note);

    if (supabaseClient) {
      const { error } = await supabaseClient
        .from(activeTableName)
        .upsert(payload, { onConflict: 'id', returning: 'minimal' });
      if (error) {
        throw error;
      }
    } else {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${activeTableName}?on_conflict=id`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal,resolution=merge-duplicates'
        },
        body: JSON.stringify([payload])
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    }

    persistLocalNotes();
  } catch (error) {
    persistLocalNotes();
  }
}

async function deleteNoteFromSupabase(noteId) {
  try {
    if (!activeTableName) {
      activeTableName = await resolveActiveTableName();
    }

    if (!activeTableName) {
      throw new Error('No se encontró una tabla disponible en Supabase');
    }

    if (supabaseClient) {
      const { error } = await supabaseClient
        .from(activeTableName)
        .delete()
        .eq('id', noteId);
      if (error) {
        throw error;
      }
    } else {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${activeTableName}?id=eq.${encodeURIComponent(noteId)}`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    }
  } catch (error) {
    console.error('No se pudo borrar la nota en Supabase:', error);
  }
}

// Mostrar notas en la grilla.
function appendChatMessage(role, message) {
  if (!chatMessages) return;

  const wrapper = document.createElement('div');
  wrapper.className = `chat-message ${role}`;

  const roleLabel = document.createElement('span');
  roleLabel.className = 'chat-message-role';
  roleLabel.textContent = role === 'assistant' ? 'Groq' : 'Tú';

  const content = document.createElement('div');
  content.className = 'chat-message-content';
  content.textContent = message;

  wrapper.appendChild(roleLabel);
  wrapper.appendChild(content);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderNotes() {
  if (!notes.length) {
    notesGrid.innerHTML = '<p class="empty-state">Aún no hay notas. Crea la primera.</p>';
    return;
  }

  notesGrid.innerHTML = '';

  notes.forEach((note) => {
    const card = document.createElement('article');
    card.className = 'note-card';

    card.innerHTML = `
      <div class="note-card-top">
        <h3>${note.title}</h3>
        <div class="note-actions">
          <button type="button" class="icon-btn" data-action="edit" data-id="${note.id}" aria-label="Editar nota">✎</button>
          <button type="button" class="icon-btn danger" data-action="delete" data-id="${note.id}" aria-label="Eliminar nota">🗑</button>
        </div>
      </div>
      <p>${note.content}</p>
      <footer class="note-footer"><span class="chip">${note.category}</span></footer>
    `;

    notesGrid.appendChild(card);
  });
}

async function askGroq(question) {
  if (!question) return;

  const notePayload = notes.map((note) => ({
    id: note.id,
    title: note.title,
    category: note.category,
    content: note.content,
    createdAt: note.createdAt
  }));

  appendChatMessage('user', question);
  appendChatMessage('assistant', 'Pensando...');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ question, notes: notePayload })
    });

    const data = await response.json();
    const lastMessage = chatMessages.lastElementChild;
    if (lastMessage && lastMessage.querySelector('.chat-message-role')?.textContent === 'Groq') {
      lastMessage.remove();
    }

    if (!response.ok) {
      const error = data?.error || 'Error al consultar a Groq';
      appendChatMessage('assistant', typeof error === 'string' ? error : JSON.stringify(error));
      return;
    }

    appendChatMessage('assistant', data.answer || 'Groq no devolvió una respuesta.');
  } catch (error) {
    const lastMessage = chatMessages.lastElementChild;
    if (lastMessage && lastMessage.querySelector('.chat-message-role')?.textContent === 'Groq') {
      lastMessage.remove();
    }
    appendChatMessage('assistant', 'Error en la consulta: ' + (error?.message || error));
  }
}

// Abrir modal para crear una nota nueva.
function openModal() {
  editingId = null;
  noteForm.reset();
  noteIdInput.value = '';
  modalTitle.textContent = 'Nueva nota';
  modalSubtitle.textContent = 'Apunta esa idea antes de que se te escape.';
  modalToggle.checked = true;
  titleInput.focus();
}

// Abrir modal para editar una nota existente.
function openEditModal(noteId) {
  const note = notes.find((item) => item.id === noteId);
  if (!note) return;

  editingId = noteId;
  noteIdInput.value = note.id;
  titleInput.value = note.title;
  contentInput.value = note.content;

  categoryInputs.forEach((input) => {
    input.checked = input.value === note.category;
  });

  modalTitle.textContent = 'Editar nota';
  modalSubtitle.textContent = 'Modifica el contenido y guarda tus cambios.';
  modalToggle.checked = true;
  titleInput.focus();
}

// Cerrar modal.
function closeModal() {
  modalToggle.checked = false;
  noteForm.reset();
  noteIdInput.value = '';
  editingId = null;
}

// Crear o actualizar una nota según el modo.
async function handleSubmit(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  const category = Array.from(categoryInputs).find((input) => input.checked)?.value || 'trabajo';

  if (!title || !content) {
    alert('Completa el título y el contenido de la nota.');
    return;
  }

  let savedNote;

  if (editingId) {
    notes = notes.map((note) =>
      note.id === editingId
        ? (savedNote = { ...note, title, content, category })
        : note
    );
  } else {
    const newNote = {
      id: crypto.randomUUID(),
      title,
      content,
      category,
      createdAt: 'Ahora'
    };
    notes.unshift(newNote);
    savedNote = newNote;
  }

  await saveNote(savedNote);
  renderNotes();
  closeModal();
}

// Eventos del chat.
chatForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const question = chatQuestionInput?.value.trim();
  if (!question) return;
  chatQuestionInput.value = '';
  void askGroq(question);
});

// Eliminar una nota.
async function deleteNote(noteId) {
  const confirmed = window.confirm('¿Seguro que quieres borrar esta nota?');
  if (!confirmed) return;

  notes = notes.filter((note) => note.id !== noteId);

  await deleteNoteFromSupabase(noteId);
  persistLocalNotes();
  renderNotes();
}

// Delegación de eventos para botones de editar/borrar.
notesGrid.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const noteId = button.dataset.id;

  if (action === 'edit') {
    openEditModal(noteId);
  }

  if (action === 'delete') {
    void deleteNote(noteId);
  }
});

// Eventos del modal.
openModalBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
cancelNoteBtn.addEventListener('click', closeModal);
noteForm.addEventListener('submit', (event) => {
  void handleSubmit(event);
});

// Cerrar al hacer clic fuera del contenido del modal.
modalToggle.addEventListener('change', () => {
  if (!modalToggle.checked) {
    closeModal();
  }
});

// Inicializar la app.
initSyncStatus();
void loadNotes().then(async () => {
  const isRealtimeConnected = await subscribeRealtime();
  startPollingNotes();
  if (!isRealtimeConnected) {
    console.warn('Realtime no se conectó, usando sondeo de respaldo.');
  }
});
