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

// Elementi DOM principali
const tablesGridContainer = document.getElementById('tables-grid');
const orderDetailsContainer = document.getElementById('order-details');
const dashboardLayout = document.getElementById('admin-dashboard-layout');
const historyContainer = document.getElementById('orders-container-history');

// Variabili globali
let activeTableOrders = {}; 
let currentView = 'active'; 
let unsubscribeOrders = null; 
let selectedTableId = null; 
const TOTAL_TABLES = 35; // Numero massimo di tavoli nella griglia

// Definizione degli stati e dei colori (per la griglia dei tavoli)
const STATUS_COLORS = {
    pending: 'pending',     
    executed: 'executed',   
    free: 'free'           
};

// ====================================================================
// 2. GESTIONE AUTENTICAZIONE (AUTH) - OK
// ====================================================================

// Funzioni handleAdminLogin, handleAdminLogout, auth.onAuthStateChanged
// ... (codice omesso per brevità, assumendo sia rimasto invariato e funzionante) ...

// Rimosso il codice omesso per brevità, usa il tuo codice originale qui

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
// 3. LOGICA DASHBOARD (CORE)
// ====================================================================

/**
 * Funzione di utilità per formattare il Timestamp in ora leggibile.
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
 */
function initializeAdminDashboard(user) {
    console.log(`Dashboard Admin avviata per: ${user.email}`);

    const logoutBtn = document.getElementById('admin-logout-btn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', handleAdminLogout);
    }
    
    setupViewFilters();
    renderTableGrid();
    listenForActiveOrders(); 

    if (tablesGridContainer) {
        tablesGridContainer.addEventListener('click', handleTableClick); 
    }

    if(orderDetailsContainer) {
        orderDetailsContainer.addEventListener('click', handleStatusButtonClick);
    }
}

/**
 * Configura gli event listener per i pulsanti di cambio vista.
 */
function setupViewFilters() {
    const filterContainer = document.getElementById('order-filters');
    if (!filterContainer) return;

    filterContainer.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', () => {
            const newView = button.getAttribute('data-view');
            if (newView === currentView) return; 

            filterContainer.querySelector('.active').classList.remove('active');
            button.classList.add('active');

            currentView = newView;
            if (newView === 'history') {
                dashboardLayout.classList.add('hidden');
                historyContainer.classList.remove('hidden');
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
    let buttonClass; 
    
    if (order.status === 'pending') {
        buttonText = 'MARCA COME ESEGUITO';
        newStatusOnNextClick = 'executed';
        buttonClass = 'btn-executed'; 
    } else if (order.status === 'executed') {
        buttonText = 'MARCA COME PAGATO (COMPLETA)';
        newStatusOnNextClick = 'completed';
        buttonClass = 'btn-completed'; 
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

/**
 * Gestisce il click su un tavolo della griglia.
 */
function handleTableClick(e) {
    const button = e.target.closest('.table-btn');
    if (!button) return;

    const tableNumber = button.dataset.table;
    selectedTableId = tableNumber;

    // 1. Gestione della selezione visiva
    document.querySelectorAll('.table-btn').forEach(btn => btn.classList.remove('selected'));
    
    const activeOrder = activeTableOrders[tableNumber];

    if (activeOrder) {
        button.classList.add('selected'); // Seleziona solo se c'è un ordine attivo
        displayOrderDetails(activeOrder);
    } else {
        // Tavolo Libero
        displayTableFree(tableNumber);
    }
}

/**
 * Gestisce il click sui pulsanti di aggiornamento dello stato.
 */
function handleStatusButtonClick(e) {
    const button = e.target.closest('.update-status-btn');
    if (!button) return;

    const orderId = button.dataset.orderId;
    const newStatus = button.dataset.newStatus;

    if (orderId && newStatus) {
        updateOrderStatus(orderId, newStatus);
    }
}

/**
 * Aggiorna lo stato di un ordine su Firestore.
 */
async function updateOrderStatus(orderId, newStatus) {
    const updateData = { status: newStatus };
    
    if (newStatus === 'completed') {
        updateData.completionTime = firebase.firestore.FieldValue.serverTimestamp();
    }

    try {
        await db.collection('orders').doc(orderId).update(updateData);
        console.log(`Ordine ${orderId} segnato come ${newStatus}.`);
    } catch (error) {
        console.error("Errore nell'aggiornamento dello stato:", error);
        alert("Impossibile aggiornare lo stato dell'ordine. (Controlla le regole di scrittura admin)");
    }
}

// --- FUNZIONI DI BASE GRIGLIA E LISTENER ---

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
        tableButton.dataset.table = tableNumber;
        
        tablesGridContainer.appendChild(tableButton);
    }
}

/**
 * Ascolta in tempo reale TUTTI gli ordini non ancora completati (pending, executed).
 * Utilizza Promise.all per unire due query di stato, aggirando il limite del where !=.
 */
function listenForActiveOrders() {
    if (unsubscribeOrders) {
        unsubscribeOrders();
        unsubscribeOrders = null;
    }

    // Listener per 'pending'
    const pendingQuery = db.collection('orders')
        .where('status', '==', 'pending')
        .orderBy('timestamp', 'asc');
    
    // Listener per 'executed'
    const executedQuery = db.collection('orders')
        .where('status', '==', 'executed')
        .orderBy('timestamp', 'asc');

    console.log("Avvio listener per gli ordini attivi...");
    
    // Unisce i due listener
    unsubscribeOrders = pendingQuery.onSnapshot(() => {
        // Quando c'è un aggiornamento, recupera entrambi i set di dati in una transazione leggera
        Promise.all([pendingQuery.get(), executedQuery.get()])
            .then(([pendingSnapshot, executedSnapshot]) => {
                const newActiveOrders = {};

                // Processa gli ordini Pending
                pendingSnapshot.forEach(doc => {
                    const order = doc.data();
                    newActiveOrders[order.tableId] = { ...order, docId: doc.id };
                });

                // Processa gli ordini Executed (sovr scrivono se sono più recenti, ma in teoria non dovrebbero esserci sovrapposizioni)
                executedSnapshot.forEach(doc => {
                    const order = doc.data();
                    // Controlliamo che sia l'ordine più recente (solo per sicurezza, in genere un tavolo ha un solo ordine attivo)
                    if (!newActiveOrders[order.tableId] || order.timestamp.toDate() > newActiveOrders[order.tableId].timestamp.toDate()) {
                        newActiveOrders[order.tableId] = { ...order, docId: doc.id };
                    }
                });

                activeTableOrders = newActiveOrders;

                updateTableGridAppearance();

                if (selectedTableId) {
                    if (activeTableOrders[selectedTableId]) {
                        displayOrderDetails(activeTableOrders[selectedTableId]);
                    } else {
                        displayTableFree(selectedTableId);
                        selectedTableId = null; 
                    }
                }
            })
            .catch(error => {
                 console.error("Errore nel ricevere gli ordini attivi:", error);
            });
    }, error => {
         console.error("Errore nel listener Pending:", error);
    });

    // BONUS: aggiungiamo un secondo listener per 'executed' per coprire tutti i cambiamenti
    // Senza riutilizzare 'unsubscribeOrders', altrimenti sovrascriveremmo.
    executedQuery.onSnapshot(() => {
        // Questo listener scatenerà la logica di aggiornamento (che è già gestita dal Promise.all nel primo listener)
        // Per semplicità, richiamiamo la stessa logica di unione dati qui:
        Promise.all([pendingQuery.get(), executedQuery.get()])
            .then(([pendingSnapshot, executedSnapshot]) => {
                const newActiveOrders = {};
                
                pendingSnapshot.forEach(doc => {
                    const order = doc.data();
                    newActiveOrders[order.tableId] = { ...order, docId: doc.id };
                });
                
                executedSnapshot.forEach(doc => {
                    const order = doc.data();
                    if (!newActiveOrders[order.tableId] || order.timestamp.toDate() > newActiveOrders[order.tableId].timestamp.toDate()) {
                        newActiveOrders[order.tableId] = { ...order, docId: doc.id };
                    }
                });

                activeTableOrders = newActiveOrders;
                updateTableGridAppearance();

                if (selectedTableId) {
                    if (activeTableOrders[selectedTableId]) {
                        displayOrderDetails(activeTableOrders[selectedTableId]);
                    } else {
                        displayTableFree(selectedTableId);
                        selectedTableId = null; 
                    }
                }
            })
             .catch(error => {
                 console.error("Errore nel ricevere gli ordini attivi:", error);
            });
    }, error => {
         console.error("Errore nel listener Executed:", error);
    });
}

/**
 * Aggiorna il colore e le classi dei pulsanti dei tavoli in base a activeTableOrders.
 */
function updateTableGridAppearance() {
    if (!tablesGridContainer) {
        console.error("ERRORE CRITICO: tablesGridContainer non trovato.");
        return; 
    }
    
    for (let i = 1; i <= TOTAL_TABLES; i++) {
        const tableNumber = String(i);
        const tableButton = tablesGridContainer.querySelector(`[data-table="${tableNumber}"]`);

        if (!tableButton) continue;

        const activeOrder = activeTableOrders[tableNumber];

        // Rimuovi tutte le classi di stato precedenti
        Object.values(STATUS_COLORS).forEach(statusClass => {
            tableButton.classList.remove(statusClass);
        });
        tableButton.classList.remove('selected'); 

        if (activeOrder) {
            tableButton.classList.add(activeOrder.status); 
        } else {
            tableButton.classList.add(STATUS_COLORS.free);
        }

        // Riapplica la selezione se è il tavolo corrente E ha un ordine attivo
        if (tableNumber === selectedTableId && activeOrder) {
             tableButton.classList.add('selected');
        }
    }
}


// ====================================================================
// 5. LOGICA DASHBOARD - STORICO ORDINI (NUOVO) - OK
// ====================================================================

/**
 * Legge e visualizza gli ordini completati (Storico).
 */
async function fetchHistoryOrders() {
    if (!historyContainer) return;

    historyContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Caricamento storico...</div>';

    try {
        // Query per ordini completati, ordinati dal più recente (RICHIEDE INDICE COMPOSTO)
        const snapshot = await db.collection('orders')
          .where('status', '==', 'completed')
          .orderBy('completionTime', 'desc') 
          .limit(50) 
          .get();
          
        historyContainer.innerHTML = '';
        
        if (snapshot.empty) {
            historyContainer.innerHTML = '<p class="empty-message">Nessun ordine completato nell\'archivio recente.</p>';
            return;
        }
        
        snapshot.forEach(doc => {
            const order = doc.data();
            const orderId = doc.id;
            renderHistoryCard(order, orderId); 
        });

    } catch (error) {
        console.error("Errore nel caricamento dello storico:", error);
        // Se la query fallisce per l'indice mancante, Firestore loggherà il link per crearlo.
        historyContainer.innerHTML = '<p class="error-message">Errore nel caricamento dello storico ordini. (Controlla la console per creare l\'indice Firestone: status, completionTime)</p>';
    }
}

/**
 * Crea e aggiunge la card HTML per un singolo ordine nello Storico.
 */
function renderHistoryCard(order, orderId) {
    const card = document.createElement('div');
    card.className = `order-card completed history-card`; 
    
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
// 6. INIZIALIZZAZIONE DOM GLOBALE - OK
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.endsWith('admin-login.html')) {
        handleAdminLogin();
    }
});
