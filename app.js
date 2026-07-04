// Estado inicial de la app.
// Se guarda en localStorage para que las notas persistan al recargar.
const STORAGE_KEY = 'notes-app-data';

let notes = [];
let editingId = null;

// Referencias a elementos del DOM.
const notesGrid = document.getElementById('notes-grid');
const modalToggle = document.getElementById('modal-toggle');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelNoteBtn = document.getElementById('cancel-note-btn');
const noteForm = document.getElementById('note-form');
const modalTitle = document.getElementById('modal-title');
const modalSubtitle = document.querySelector('.modal-sub');
const noteIdInput = noteForm.querySelector('input[name="note-id"]');
const titleInput = noteForm.querySelector('input[name="title"]');
const categoryInputs = noteForm.querySelectorAll('input[name="category"]');
const contentInput = noteForm.querySelector('textarea[name="content"]');

// Cargar datos desde localStorage si existen.
function loadNotes() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      notes = JSON.parse(saved);
    } catch (error) {
      console.error('No se pudieron leer las notas guardadas:', error);
      notes = [];
    }
  } else {
    // Datos iniciales para ver la interfaz con contenido.
    notes = [
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
}

// Guardar notas en localStorage.
function saveNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

// Mostrar notas en la grilla.
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
function handleSubmit(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  const category = Array.from(categoryInputs).find((input) => input.checked)?.value || 'trabajo';

  if (!title || !content) {
    alert('Completa el título y el contenido de la nota.');
    return;
  }

  if (editingId) {
    notes = notes.map((note) =>
      note.id === editingId
        ? { ...note, title, content, category }
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
  }

  saveNotes();
  renderNotes();
  closeModal();
}

// Eliminar una nota.
function deleteNote(noteId) {
  const confirmed = window.confirm('¿Seguro que quieres borrar esta nota?');
  if (!confirmed) return;

  notes = notes.filter((note) => note.id !== noteId);
  saveNotes();
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
    deleteNote(noteId);
  }
});

// Eventos del modal.
openModalBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
cancelNoteBtn.addEventListener('click', closeModal);
noteForm.addEventListener('submit', handleSubmit);

// Cerrar al hacer clic fuera del contenido del modal.
modalToggle.addEventListener('change', () => {
  if (!modalToggle.checked) {
    closeModal();
  }
});

// Inicializar la app.
loadNotes();
renderNotes();
