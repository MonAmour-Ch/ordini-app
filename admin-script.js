// ====================================================================
// 1. CONFIGURAZIONE FIREBASE E INIZIALIZZAZIONE
// ====================================================================

const firebaseConfig = {
    apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
    authDomain: "menu-6630f.firebaseapp.com",
    projectId: "menu-6630f"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const tablesGridContainer = document.getElementById('tables-grid');
const orderDetailsContainer = document.getElementById('order-details');
const dashboardLayout = document.getElementById('admin-dashboard-layout');
const historyContainer = document.getElementById('orders-container-history');

let activeTableOrders = {};
let currentView = 'active';
let selectedTableId = null;
const TOTAL_TABLES = 35;

// 🔊 Suono per i nuovi ordini
const newOrderSound = new Audio('sounds/new-order.mp3');
newOrderSound.volume = 0.8;
let initializedSound = false;

const STATUS_COLORS = {
    pending: 'pending',
    executed: 'executed',
    free: 'free'
};

// ====================================================================
// 2. AUTENTICAZIONE
// ====================================================================

function handleAdminLogin() {
    const loginForm = document.getElementById('admin-login-form');
    if (!loginForm) return;

    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('admin-login-btn');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const email = emailInput.value;
        const password = passwordInput.value;

        errorMessage.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Accesso...';

        auth.signInWithEmailAndPassword(email, password)
            .catch(() => {
                errorMessage.textContent = 'Accesso negato. Credenziali non valide.';
            })
            .finally(() => {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Accedi';
            });
    });
}

function handleAdminLogout() {
    auth.signOut().catch(() => alert("Errore durante il logout."));
}

auth.onAuthStateChanged(user => {
    const isAdminPage = window.location.pathname.endsWith('admin.html');
    const isLoginPage = window.location.pathname.endsWith('admin-login.html');

    if (user) {
        if (isLoginPage) window.location.href = 'admin.html';
        if (isAdminPage) initializeAdminDashboard(user);
    } else {
        if (isAdminPage) window.location.href = 'admin-login.html';
    }
});

// ====================================================================
// 3. DASHBOARD
// ====================================================================

function formatTimestampToTime(timestamp, includeDate = false) {
    if (!timestamp) return 'Ora Sconosciuta';
    const date = timestamp.toDate();
    const options = includeDate
        ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { hour: '2-digit', minute: '2-digit' };
    return date.toLocaleTimeString('it-IT', options);
}

function initializeAdminDashboard() {
    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleAdminLogout);

    setupViewFilters();
    renderTableGrid();
    listenForActiveOrders();

    tablesGridContainer?.addEventListener('click', handleTableClick);
    orderDetailsContainer?.addEventListener('click', handleStatusButtonClick);
}

function setupViewFilters() {
    const filterContainer = document.getElementById('order-filters');
    if (!filterContainer) return;

    filterContainer.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', () => {
            const newView = button.getAttribute('data-view');
            if (newView === currentView) return;

            filterContainer.querySelector('.active')?.classList.remove('active');
            button.classList.add('active');

            currentView = newView;

            if (newView === 'history') {
                dashboardLayout.classList.add('hidden');
                historyContainer.classList.remove('hidden');
                fetchHistoryOrders();
            } else {
                historyContainer.classList.add('hidden');
                dashboardLayout.classList.remove('hidden');
            }
        });
    });
}

// ====================================================================
// 4. LOGICA TAVOLI E ORDINI
// ====================================================================

function displayOrderDetails(order) {
    const time = formatTimestampToTime(order.timestamp);

    const itemsHtml = order.items.map(item =>
        `<li>${item.quantity}x ${item.name} <span class="item-price">€${(item.quantity * item.price).toFixed(2)}</span></li>`
    ).join('');

    const noteHtml = order.notes
        ? `<div class="order-note-display"><strong><i class="fas fa-sticky-note"></i> NOTA:</strong> ${order.notes}</div>`
        : '';

    const buttonConfig = {
        pending: { text: 'MARCA COME ESEGUITO', next: 'executed', class: 'btn-executed' },
        executed: { text: 'MARCA COME PAGATO (COMPLETA)', next: 'completed', class: 'btn-completed' }
    }[order.status] || { text: 'STATO SCONOSCIUTO', next: '', class: 'btn-default' };

    orderDetailsContainer.innerHTML = `
        <div class="card-header">
            <h3>Ordine Tavolo ${order.tableId}</h3>
            <span class="order-time">Ricevuto alle ${time}</span>
        </div>
        <ul class="order-items">${itemsHtml}</ul>
        ${noteHtml}
        <div class="order-footer">
            <strong>TOTALE: €${order.total.toFixed(2)}</strong>
            <button class="update-status-btn ${buttonConfig.class}"
                data-order-id="${order.docId}"
                data-new-status="${buttonConfig.next}">
                <i class="fas fa-check"></i> ${buttonConfig.text}
            </button>
        </div>
    `;
}

function displayTableFree(tableNumber) {
    orderDetailsContainer.innerHTML = `<p class="empty-message">Tavolo ${tableNumber} libero.</p>`;
}

function handleTableClick(e) {
    const button = e.target.closest('.table-btn');
    if (!button) return;

    const tableNumber = button.dataset.table;
    selectedTableId = tableNumber;

    document.querySelectorAll('.table-btn').forEach(b => b.classList.remove('selected'));

    const order = activeTableOrders[tableNumber];
    if (order) {
        button.classList.add('selected');
        displayOrderDetails(order);
    } else {
        displayTableFree(tableNumber);
    }
}

function handleStatusButtonClick(e) {
    const button = e.target.closest('.update-status-btn');
    if (!button) return;

    updateOrderStatus(button.dataset.orderId, button.dataset.newStatus);
}

async function updateOrderStatus(orderId, newStatus) {
    const update = { status: newStatus };

    if (newStatus === 'completed')
        update.completionTime = firebase.firestore.FieldValue.serverTimestamp();

    await db.collection('orders').doc(orderId).update(update)
        .catch(() => alert("Impossibile aggiornare lo stato."));
}

function renderTableGrid() {
    tablesGridContainer.innerHTML = '';
    for (let i = 1; i <= TOTAL_TABLES; i++) {
        const btn = document.createElement('button');
        btn.className = 'table-btn free';
        btn.dataset.table = String(i);
        tablesGridContainer.appendChild(btn);
    }
}

// ====================================================================
// 🔊 LISTENER ORDINI IN TEMPO REALE CON SUONO
// ====================================================================

function listenForActiveOrders() {
    const pendingQuery = db.collection('orders')
        .where('status', '==', 'pending')
        .orderBy('timestamp', 'asc');

    const executedQuery = db.collection('orders')
        .where('status', '==', 'executed')
        .orderBy('timestamp', 'asc');

    const processSnapshots = () => {
        Promise.all([pendingQuery.get(), executedQuery.get()])
            .then(([pendingSnap, executedSnap]) => {
                const newOrders = {};

                pendingSnap.forEach(doc => newOrders[doc.data().tableId] = { ...doc.data(), docId: doc.id });
                executedSnap.forEach(doc => {
                    const d = doc.data();
                    if (!newOrders[d.tableId] || d.timestamp.toDate() >= newOrders[d.tableId].timestamp.toDate())
                        newOrders[d.tableId] = { ...d, docId: doc.id };
                });

                activeTableOrders = newOrders;
                updateTableGridAppearance();

                if (selectedTableId) {
                    const ord = activeTableOrders[selectedTableId];
                    ord ? displayOrderDetails(ord) : displayTableFree(selectedTableId);
                }
            });
    };

    pendingQuery.onSnapshot(snapshot => {
        if (initializedSound) {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') newOrderSound.play().catch(() => {});
            });
        }
        processSnapshots();
        initializedSound = true;
    });

    executedQuery.onSnapshot(snapshot => {
        if (initializedSound) {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') newOrderSound.play().catch(() => {});
            });
        }
        processSnapshots();
    });
}

// ====================================================================
// 5. STORICO ORDINI
// ====================================================================

async function fetchHistoryOrders() {
    historyContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';

    try {
        const snapshot = await db.collection('orders')
            .where('status', '==', 'completed')
            .orderBy('completionTime', 'desc')
            .limit(50)
            .get();

        historyContainer.innerHTML = '';

        if (snapshot.empty) {
            historyContainer.innerHTML = '<p class="empty-message">Nessun ordine completato.</p>';
            return;
        }

        snapshot.forEach(doc => renderHistoryCard(doc.data()));

    } catch {
        historyContainer.innerHTML = '<p class="error-message">Errore caricamento storico.</p>';
    }
}

function renderHistoryCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card completed history-card';

    const time = formatTimestampToTime(order.completionTime, true);
    const itemsHtml = order.items.map(i =>
        `<li>${i.quantity}x ${i.name} <span class="item-price">€${(i.quantity * i.price).toFixed(2)}</span></li>`
    ).join('');

    const noteHtml = order.notes
        ? `<div class="order-note-display"><strong><i class="fas fa-sticky-note"></i> NOTA:</strong> ${order.notes}</div>`
        : '';

    card.innerHTML = `
        <div class="card-header">
            <h3>Tavolo: ${order.tableId}</h3>
            <span class="order-time">Chiuso: ${time}</span>
        </div>
        <ul class="order-items">${itemsHtml}</ul>
        ${noteHtml}
        <div class="order-footer">
            <strong>TOTALE: €${order.total.toFixed(2)}</strong>
            <span class="completed-label"><i class="fas fa-check-circle"></i> Ordine Pagato</span>
        </div>`;

    historyContainer.appendChild(card);
}

// ====================================================================
// 6. DOM READY
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.endsWith('admin-login.html'))
        handleAdminLogin();
});
