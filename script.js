// ====================================================================
// 1. CONFIGURAZIONE E INIZIALIZZAZIONE FIREBASE
// ====================================================================

// CONFIGURAZIONE: Usa la TUA configurazione fornita
const firebaseConfig = {
    apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
    authDomain: "menu-6630f.firebaseapp.com",
    projectId: "menu-6630f",
    storageBucket: "menu-6630f.firebasestorage.app",
    messagingSenderId: "250958312970",
    appId: "1:250958312970:web:9a7929c07e8c4fa352d1f3",
    measurementId: "G-GTQS2S4GNF"
};

// Inizializza Firebase e Firestore (Compat Mode)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ====================================================================
// 2. VARIABILI GLOBALI E STATO
// ====================================================================

// Elementi DOM (Cache dei selettori)
const menuContainer = document.getElementById('menu-container');
const cartList = document.getElementById('cart-list');
const totalPriceSpan = document.getElementById('total-price');
const sendOrderBtn = document.getElementById('send-order-btn');
const tableIdSpan = document.getElementById('table-id');
const navQuickLinks = document.getElementById('quick-links');

// NUOVI SELETTORI PER LA MODALE CARRELLO
const cartModal = document.getElementById('cart-modal');
const toggleCartBtn = document.getElementById('toggle-cart-btn');
const closeCartBtn = document.querySelector('#cart-modal .close-btn');
const cartItemCount = document.getElementById('cart-item-count');
const cartFixedTotal = document.getElementById('cart-fixed-total');

// Stato dell'applicazione
let cart = []; // Array per contenere gli articoli nel carrello
let tableId = 'Tavolo non trovato'; // Modificato il default per chiarezza
let menuStructure = {}; // Salverà la struttura del menu raggruppato

// ====================================================================
// 3. LOGICA DI CARRELLO E STATO
// ====================================================================

/**
 * Ottiene e imposta l'ID del tavolo dall'URL (?tableId=...)
 */
function getTableIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('tableId');
    if (id) {
        tableId = id.toUpperCase();
    }
    tableIdSpan.textContent = tableId;
}

/**
 * Gestisce l'apertura e la chiusura della Modale Carrello.
 */
function toggleCartModal(show) {
    if (show) {
        cartModal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Impedisce lo scroll del body
    } else {
        cartModal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Aggiunge un articolo al carrello o incrementa la quantità se già presente.
 * @param {object} item - L'articolo da aggiungere ({id, name, price}).
 */
function addToCart(item) {
    const existingItem = cart.find(i => i.id === item.id);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...item, quantity: 1 });
    }
    renderCart();
}

/**
 * Aggiorna la quantità di un articolo esistente nel carrello.
 * @param {string} itemId - ID dell'articolo da aggiornare.
 * @param {number} change - Valore di incremento/decremento (es. 1 o -1).
 */
function updateQuantity(itemId, change) {
    const itemIndex = cart.findIndex(i => i.id === itemId);

    if (itemIndex !== -1) {
        const newQuantity = cart[itemIndex].quantity + change;

        if (newQuantity <= 0) {
            removeItem(itemId);
        } else {
            cart[itemIndex].quantity = newQuantity;
            renderCart();
        }
    }
}

/**
 * Rimuove un articolo completamente dal carrello.
 * @param {string} itemId - ID dell'articolo da rimuovere.
 */
function removeItem(itemId) {
    cart = cart.filter(item => item.id !== itemId);
    renderCart();
}

/**
 * Collega gli eventi di delegation ai pulsanti di manipolazione del carrello (+, -, Rimuovi) nel Modale.
 */
function attachCartEventListeners() {
    // Si usa il delegation event listener sull'elemento genitore (cartList)
    cartList.onclick = (e) => {
        // Cerca il pulsante più vicino con la classe .cart-btn
        const button = e.target.closest('.cart-btn');
        if (!button) return; // Non è un pulsante del carrello

        const itemId = button.dataset.id;

        if (button.classList.contains('cart-increment')) {
            updateQuantity(itemId, 1);
        } else if (button.classList.contains('cart-decrement')) {
            updateQuantity(itemId, -1);
        } else if (button.classList.contains('cart-remove')) {
            removeItem(itemId);
        }
    };
}


/**
 * Aggiorna la lista del carrello nell'interfaccia utente (UI) e la barra fissa.
 */
function renderCart() {
    cartList.innerHTML = '';
    let total = 0;
    let itemCount = 0;

    cart.sort((a, b) => a.name.localeCompare(b.name));

    if (cart.length === 0) {
        cartList.innerHTML = '<li style="text-align: center; color: #6c757d; padding: 20px;">Il carrello è vuoto. Aggiungi qualcosa dal menu!</li>';
        sendOrderBtn.disabled = true;
    } else {
        sendOrderBtn.disabled = false;
    }
    
    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        itemCount += item.quantity;

        const li = document.createElement('li');
        li.className = 'cart-item'; // Classe dal CSS moderno
        li.dataset.id = item.id;
        li.innerHTML = `
            <div class="item-details">
                <strong>${item.name}</strong>
                <span>€${item.price.toFixed(2)}</span>
            </div>
            
            <div class="cart-item-controls">
                <button class="cart-btn cart-decrement minus-btn" data-id="${item.id}">-</button>
                <span class="cart-qty">${item.quantity}</span>
                <button class="cart-btn cart-increment" data-id="${item.id}">+</button>
                </div>
        `;
        cartList.appendChild(li);
    });

    // Aggiornamento Totali nel Modale e nella Barra Fissa
    const formattedTotal = total.toFixed(2);
    totalPriceSpan.textContent = formattedTotal;
    cartItemCount.textContent = itemCount;
    cartFixedTotal.textContent = formattedTotal;
}


// ====================================================================
// 4. LOGICA DEL MENU E FIREBASE (Migliorata con Navigazione)
// ====================================================================

/**
 * Raggruppa un array piatto di articoli per il campo 'category'.
 */
function groupItemsByCategory(items) {
    // ... la tua logica è corretta ...
    return items.reduce((acc, item) => {
        const category = item.category || 'Altro';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(item);
        return acc;
    }, {});
}

/**
 * Genera i pulsanti di navigazione rapida (Quick Links) in base alle categorie.
 * @param {object} groupedItems - Il menu raggruppato.
 */
function renderCategoryNavigation(groupedItems) {
    navQuickLinks.innerHTML = '';
    const sortedCategories = Object.keys(groupedItems).sort();

    sortedCategories.forEach(category => {
        const cleanId = `category-${category.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
        
        const button = document.createElement('button');
        button.className = 'category-btn';
        button.textContent = category;
        
        // Collega l'evento di scroll all'ID della sezione
        button.addEventListener('click', () => {
            const target = document.getElementById(cleanId);
            if (target
