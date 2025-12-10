// ====================================================================
// 1. CONFIGURAZIONE FIREBASE E INIZIALIZZAZIONE
// ====================================================================

// --- Configurazione (Include solo i campi necessari per App/Auth/Firestore) ---
const firebaseConfig = {
    apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
    authDomain: "menu-6630f.firebaseapp.com",
    projectId: "menu-6630f",
};

// Inizializzazione Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Elementi DOM principali per la nuova interfaccia
const tablesGridContainer = document.getElementById('tables-grid');
const orderDetailsContainer = document.getElementById('order-details');

// NUOVI SELETTORI PER LA GESTIONE DELLA VISTA
const dashboardLayout = document.getElementById('admin-dashboard-layout');
const historyContainer = document.getElementById('orders-container-history');


// Mappa globale per memorizzare gli ordini attivi per Tavolo (key: tableId)
let activeTableOrders = {}; 

// Definizione degli stati e dei colori (per la griglia dei tavoli)
const STATUS_COLORS = {
    pending: 'pending',     // Colore Giallo/Arancio (classe CSS)
    executed: 'executed',   // Colore Blu (classe CSS)
    completed: 'completed', // Colore Verde (classe CSS - da rimuovere dal tavolo attivo)
    free: 'free'            // Grigio (classe CSS - da usare come default)
};
const TOTAL_TABLES = 35; // Numero massimo di tavoli nella griglia

// ====================================================================
// 2. GESTIONE AUTENTICAZIONE (AUTH) - NON MODIFICATA
// ====================================================================

/**
 * Gestisce il processo di login per admin-login.html.
 * ... (omissis, codice non modificato) ...
 */
function handleAdminLogin() {
    const loginForm = document.getElementById('admin-login-form');
    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('admin-login-btn');
    const errorMessage = document.getElementById('error-message');

    if (!loginForm || !loginBtn) return;

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const email = emailInput.value;
        const password = passwordInput.value;
        
        errorMessage.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Accesso...';

        auth.signInWithEmailAndPassword(email, password)
            .then(() => {
                console.log("Login Admin riuscito.");
            })
            .catch(error => {
                console.error("Errore di Login Admin:", error.message);
                errorMessage.textContent = 'Accesso negato. Credenziali non valide.';
            })
            .finally(() => {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Accedi';
            });
    });
}

/**
 * Funzione di Logout per admin.html.
 * ... (omissis, codice non modificato) ...
 */
function handleAdminLogout() {
    auth.signOut().then(() => {
        // Logout riuscito. onAuthStateChanged reindirizzerà a admin-login.html.
    }).catch(error => {
        console.error("Errore durante il Logout:", error);
        alert("Errore durante il logout. Riprova.");
    });
}

// --- Listener Globale di Stato Autenticazione ---
auth.onAuthStateChanged(user => {
    const isAdminPage = window.location.pathname.endsWith('admin.html');
    const isAdminLoginPage = window.location.pathname.endsWith('admin-login.html');

    if (user) {
        if (isAdminLoginPage) {
            window.location.href = 'admin.html'; 
        } else if (isAdminPage) {
            initializeAdminDashboard(user); 
        }
    } else {
        if (isAdminPage) {
            window.location.href = 'admin-login.html'; 
        }
    }
});


// ====================================================================
// 3. LOGICA DASHBOARD (CORE) - MODIFICATA PER LA GRIGLIA E LA VISTA
// ====================================================================

let currentView = 'active'; // 'active' (Tavoli Attivi) o 'history' (Storico)
let unsubscribeOrders = null; 
let selectedTableId = null; 

/**
 * Funzione di utilità per formattare il Timestamp in ora leggibile.
 * @param {firebase.firestore.Timestamp} timestamp
 * @param {boolean} includeDate - Se includere la data (utile per gli ordini completati)
 * @returns {string} L'ora formattata.
 */
function formatTimestampToTime(timestamp, includeDate = false) {
    if (!timestamp) return 'Ora Sconosciuta';
    const date = timestamp.toDate();
    let options = { hour: '2-digit', minute: '2-digit' };
    
    if (includeDate) {
        options = { ...options, day: '2-digit', month: '2-digit', year: 'numeric' };
    }
    
    return date.toLocaleTimeString('it-IT', options);
}


/**
 * Funzione principale che avvia la dashboard dopo il login.
 * @param {firebase.User} user L'oggetto utente loggato.
 */
function initializeAdminDashboard(user) {
    console.log(`Dashboard Admin avviata per: ${user.email}`);

    // Collega l'evento di Logout
    const logoutBtn = document.getElementById('admin-logout-btn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', handleAdminLogout);
    }
    
    // 1. Configura i pulsanti di filtro (Vista)
    setupViewFilters();

    // 2. Inizializza la griglia dei tavoli (vuota)
    renderTableGrid();
    
    // 3. Avvia l'ascolto degli ordini in tempo reale
    listenForActiveOrders(); 

    // 4. Configura gli event listener per i click sui tavoli
    if (tablesGridContainer) {
        tablesGridContainer.addEventListener('click', handleTableClick);
    }

    // 5. Event listener per l'aggiornamento dello stato (pulsanti nel pannello di dettaglio)
    if(orderDetailsContainer) {
        orderDetailsContainer.addEventListener('click', handleStatusButtonClick);
    }
}

/**
 * Configura gli event listener per i pulsanti di cambio vista (Tavoli Attivi vs Storico).
 */
function setupViewFilters() {
    const filterContainer = document.getElementById('order-filters');
    if (!filterContainer) return;

    filterContainer.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', () => {
            const newView = button.getAttribute('data-view');
            if (newView === currentView) return; 

            // Aggiorna la classe 'active'
            filterContainer.querySelector('.active').classList.remove('active');
            button.classList.add('active');

            // Cambia la vista
            currentView = newView;
            if (newView === 'history') {
                dashboardLayout.classList.add('hidden');
                historyContainer.classList.remove('hidden');
                // Carica e renderizza lo storico quando si cambia vista
                fetchHistoryOrders(); 
            } else { // active view
                historyContainer.classList.add('hidden');
                dashboardLayout.classList.remove('hidden');
            }
        });
    });
}


// ====================================================================
// 4. LOGICA DASHBOARD - VISTA TAVOLI
// ====================================================================

/**
 * Genera la griglia vuota dei tavoli nell'HTML la prima volta.
 */
function renderTableGrid() {
    if (!tablesGridContainer) return;

    tablesGridContainer.innerHTML = ''; 

    for (let i = 1; i <= TOTAL_TABLES; i++) {
        const tableNumber = String(i);

        const tableButton = document.createElement('button');
        tableButton.className = `table-btn ${STATUS_COLORS.free}`; // Inizia come 'free'
        // Non usiamo più textContent, ma data-table e CSS::before
        // tableButton.textContent = tableNumber;
        tableButton.dataset.table = tableNumber;
        
        tablesGridContainer.appendChild(tableButton);
    }
}

/**
 * Ascolta in tempo reale TUTTI gli ordini non ancora completati (pending, executed).
 */
function listenForActiveOrders() {
    // Stacca il listener precedente, se esiste
    if (unsubscribeOrders) {
        unsubscribeOrders();
        unsubscribeOrders = null;
    }

    // Ascolta tutti gli ordini dove lo stato NON è 'completed'
    // ATTENZIONE: Questa query con where + orderBy('status') richiede un indice in Firestore.
    const query = db.collection('orders')
      .where('status', '!=', 'completed')
      .orderBy('status', 'asc') // Ordina pending prima di executed
      .orderBy('timestamp', 'asc');
    
    console.log("Avvio listener per gli ordini attivi...");

    unsubscribeOrders = query.onSnapshot(snapshot => {
        // 1. Reset e ricostruzione della mappa degli ordini attivi
        const newActiveOrders = {};
        snapshot.forEach(doc => {
            const order = doc.data();
            // Utilizziamo l'ID dell'ordine di Firestore (doc.id) per le azioni.
            // Prendiamo l'ordine più recente per ogni tavolo se ce ne sono più di uno
            if (!newActiveOrders[order.tableId] || order.timestamp.toDate() > newActiveOrders[order.tableId].timestamp.toDate()) {
                 newActiveOrders[order.tableId] = { ...order, docId: doc.id };
            }
        });
        activeTableOrders = newActiveOrders;

        // 2. Aggiorna l'aspetto di tutti i pulsanti sulla griglia
        updateTableGridAppearance();

        // 3. Ricarica i dettagli se il tavolo selezionato è stato aggiornato o completato
        if (selectedTableId && activeTableOrders[selectedTableId]) {
            displayOrderDetails(activeTableOrders[selectedTableId]);
        } else if (selectedTableId && !activeTableOrders[selectedTableId]) {
            // Se l'ordine del tavolo selezionato è appena stato completato
            displayTableFree(selectedTableId);
            selectedTableId = null; // Deseleziona
        }

    }, error => {
        console.error("Errore nel ricevere gli ordini attivi:", error);
    });
}

/**
 * Aggiorna il colore e le classi dei pulsanti dei tavoli in base a activeTableOrders.
 */
function updateTableGridAppearance() {
    // Aggiunto controllo per null come suggerito
    if (!tablesGridContainer) {
        console.error("ERRORE CRITICO: tablesGridContainer non trovato.");
        return; 
    }
    
    for (let i = 1; i <= TOTAL_TABLES; i++) {
        const tableNumber = String(i);
        // Usa querySelector per trovare l'elemento specifico
        const tableButton = tablesGridContainer.querySelector(`[data-table="${tableNumber}"]`);

        if (!tableButton) continue;

        const activeOrder = activeTableOrders[tableNumber];

        // Rimuovi tutte le classi di stato precedenti
        Object.values(STATUS_COLORS).forEach(statusClass => {
            tableButton.classList.remove(statusClass);
        });
        tableButton.classList.remove('selected'); // Rimuovi selezione di default

        if (activeOrder) {
            // Ordine Attivo: applica la classe pending/executed
            tableButton.classList.add(activeOrder.status); 
        } else {
            // Tavolo Libero: applica la classe free
            tableButton.classList.add(STATUS_COLORS.free);
        }

        // Riapplica la selezione se è il tavolo corrente
        if (tableNumber === selectedTableId && activeOrder) {
             tableButton.classList.add('selected');
        }
    }
}


/**
 * Visualizza i dettagli dell'ordine selezionato nel pannello di dettaglio.
 */
function displayOrderDetails(order) {
    if (!orderDetailsContainer) return;

    const timeToDisplay = formatTimestampToTime(order.timestamp, false);
    
    const itemsHtml = order.items.map(item => 
        `<li>${item.quantity}x ${item.name} <span class="item-price">€${(item.quantity * item.price).toFixed(2)}</span></li>`
    ).join('');
    
    const noteText = order.notes ? order.notes.trim() : '';
    const noteHtml = noteText
        ? `<div class="order-note-display"><strong><i class="fas fa-sticky-note"></i> NOTA:</strong> ${noteText}</div>`
        : '';

    // Contenuto dinamico del pulsante
    let buttonText;
    let newStatusOnNextClick;
    let buttonClass; // NUOVA CLASSE PER LO STILE CSS
    
    if (order.status === 'pending') {
        buttonText = 'MARCA COME ESEGUITO';
        newStatusOnNextClick = 'executed';
        buttonClass = 'btn-executed'; // Definito in style.css
    } else if (order.status === 'executed') {
        buttonText = 'MARCA COME PAGATO (COMPLETA)';
        newStatusOnNextClick = 'completed';
        buttonClass = 'btn-completed'; // Definito in style.css
    } else {
        buttonText = 'STATO SCONOSCIUTO';
        newStatusOnNextClick = '';
        buttonClass = 'btn-default';
    }

    orderDetailsContainer.innerHTML = `
        <div class="card-header">
            <h3>Ordine #${order.docId.substring(0, 6)} - Tavolo ${order.tableId}</h3>
            <span class="order-time">Ricevuto alle ${timeToDisplay}</span>
        </div>
        
        <ul class="order-items">${itemsHtml}</ul>
        
        ${noteHtml} 
        
        <div class="order-footer">
            <strong>TOTALE: €${order.total.toFixed(2)}</strong>
            <button class="update-status-btn ${buttonClass}" 
                    data-order-id="${order.docId}" 
                    data-current-status="${order.status}" 
                    data-new-status="${newStatusOnNextClick}">
                <i class="fas fa-check"></i> ${buttonText}
            </button>
        </div>
    `;
}

/**
 * Visualizza il messaggio "Tavolo libero" nel pannello di dettaglio.
 */
function displayTableFree(tableNumber) {
      if (!orderDetailsContainer) return;
      orderDetailsContainer.innerHTML = `<p class="empty-message">Tavolo ${tableNumber} libero. Nessun ordine attivo.</p>`;
}

// ... (handleTableClick, handleStatusButtonClick, updateOrderStatus restano quasi uguali) ...

// ====================================================================
// 5. LOGICA DASHBOARD - STORICO ORDINI (NUOVO)
// ====================================================================

/**
 * Legge e visualizza gli ordini completati (Storico).
 */
async function fetchHistoryOrders() {
    if (!historyContainer) return;

    historyContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Caricamento storico...</div>';

    try {
        // Query per ordini completati, ordinati dal più recente
        const snapshot = await db.collection('orders')
          .where('status', '==', 'completed')
          .orderBy('completionTime', 'desc') // Ordina per tempo di completamento (Richiede indice)
          .limit(50) 
          .get();
          
        historyContainer.innerHTML = '';
        
        if (snapshot.empty) {
            historyContainer.innerHTML = '<p class="empty-message">Nessun ordine completato nell\'archivio recente.</p>';
            return;
        }
        
        // Renderizza la griglia delle card dello storico
        snapshot.forEach(doc => {
            const order = doc.data();
            const orderId = doc.id;
            renderHistoryCard(order, orderId); 
        });

    } catch (error) {
        console.error("Errore nel caricamento dello storico:", error);
        historyContainer.innerHTML = '<p class="error-message">Errore nel caricamento dello storico ordini. (Vedi console)</p>';
    }
}

/**
 * Crea e aggiunge la card HTML per un singolo ordine nello Storico.
 */
function renderHistoryCard(order, orderId) {
    const card = document.createElement('div');
    // Usa le classi CSS per le card dello storico
    card.className = `order-card completed history-card`; 
    
    // Formatta l'ora includendo la data
    const timeToDisplay = formatTimestampToTime(order.completionTime, true); 
    
    const itemsHtml = order.items.map(item => 
        `<li>${item.quantity}x ${item.name} <span class="item-price">€${(item.quantity * item.price).toFixed(2)}</span></li>`
    ).join('');
    
    const noteText = order.notes ? order.notes.trim() : '';
    const noteHtml = noteText
        ? `<div class="order-note-display"><strong><i class="fas fa-sticky-note"></i> NOTA:</strong> ${noteText}</div>`
        : '';

    card.innerHTML = `
        <div class="card-header">
            <h3>Tavolo: ${order.tableId}</h3>
            <span class="order-time">Chiuso: ${timeToDisplay}</span>
        </div>
        
        <ul class="order-items">${itemsHtml}</ul>
        
        ${noteHtml}

        <div class="order-footer">
            <strong>TOTALE: €${order.total.toFixed(2)}</strong>
            <span class="completed-label"><i class="fas fa-check-circle"></i> Ordine Pagato</span>
        </div>
    `;

    historyContainer.appendChild(card);
}


// ====================================================================
// 6. INIZIALIZZAZIONE DOM GLOBALE - NON MODIFICATA
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Si attiva solo la funzione di login se l'URL corrisponde
    if (window.location.pathname.endsWith('admin-login.html')) {
        handleAdminLogin();
    }
    // L'avvio completo della dashboard è gestito da onAuthStateChanged
});
