const firebaseConfig = {
  apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
  authDomain: "menu-6630f.firebaseapp.com",
  projectId: "menu-6630f",
  storageBucket: "menu-6630f.firebasestorage.app",
  messagingSenderId: "250958312970",
  appId: "1:250958312970:web:9a7929c07e8c4fa352d1f3",
  measurementId: "G-GTQS2S4GNF"
};
// Inizializza Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 2. VARIABILI GLOBALI ---
const menuContainer = document.getElementById('menu-container');
const cartList = document.getElementById('cart-list');
const totalPriceSpan = document.getElementById('total-price');
const sendOrderBtn = document.getElementById('send-order-btn');
const tableIdSpan = document.getElementById('table-id');

let cart = []; // Array per contenere gli articoli nel carrello
let tableId = 'DEFAULT_TAVOLO'; // Valore di default

// --- 3. FUNZIONI LOGICHE ---

// Ottiene il parametro 'tableId' dall'URL (simula la scansione QR)
function getTableIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('tableId');
    if (id) {
        tableId = id.toUpperCase();
    }
    tableIdSpan.textContent = tableId;
}

// Aggiunge un articolo al carrello
function addToCart(item) {
    const existingItem = cart.find(i => i.id === item.id);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({...item, quantity: 1});
    }

    renderCart();
}

// NUOVA FUNZIONE: Aggiorna la quantità di un articolo nel carrello
function updateQuantity(itemId, change) {
    const itemIndex = cart.findIndex(i => i.id === itemId);

    if (itemIndex !== -1) {
        const newQuantity = cart[itemIndex].quantity + change;
        
        if (newQuantity <= 0) {
            // Se la quantità scende a zero o meno, rimuovi l'articolo
            removeItem(itemId);
        } else {
            cart[itemIndex].quantity = newQuantity;
            renderCart();
        }
    }
}

// NUOVA FUNZIONE: Rimuove un articolo dal carrello
function removeItem(itemId) {
    // Filtra l'array per mantenere solo gli articoli il cui ID NON corrisponde all'ID da rimuovere
    cart = cart.filter(item => item.id !== itemId);
    renderCart();
}

// Funzione aggiornata: Aggiorna la lista del carrello e il totale nell'interfaccia
function renderCart() {
    cartList.innerHTML = '';
    let total = 0;

    // Ordina il carrello per nome per una visualizzazione più pulita
    cart.sort((a, b) => a.name.localeCompare(b.name));

    if (cart.length === 0) {
        cartList.innerHTML = '<li style="text-align: center; color: #ccc;">Il carrello è vuoto. Aggiungi qualcosa dal menu!</li>';
        sendOrderBtn.disabled = true;
        totalPriceSpan.textContent = '0.00';
        return;
    }
    
    sendOrderBtn.disabled = false;

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        
        const li = document.createElement('li');
        li.dataset.id = item.id;
        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0;">
                
                <span style="flex-grow: 1; color: #f8f9fa;">
                    <strong>${item.name}</strong> 
                    <small>(€${item.price.toFixed(2)})</small>
                </span>
                
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="cart-btn cart-decrement" data-id="${item.id}">-</button>
                    <span class="cart-qty" data-id="${item.id}" style="color: #ffc107; font-weight: bold;">${item.quantity}</span>
                    <button class="cart-btn cart-increment" data-id="${item.id}">+</button>
                    <button class="cart-btn cart-remove" data-id="${item.id}" style="color: #dc3545; background: none; border: none; font-size: 1.2em;">&times;</button>
                </div>

            </div>
        `;
        cartList.appendChild(li);
    });

    totalPriceSpan.textContent = total.toFixed(2);
    
    // Dopo aver creato i pulsanti, colleghiamo i listener di evento
    attachCartEventListeners();
}
// NUOVA FUNZIONE: Collega gli eventi ai pulsanti del carrello
function attachCartEventListeners() {
    document.querySelectorAll('.cart-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const itemId = e.target.dataset.id;
            
            if (e.target.classList.contains('cart-increment')) {
                updateQuantity(itemId, 1); // Aumenta di 1
            } else if (e.target.classList.contains('cart-decrement')) {
                updateQuantity(itemId, -1); // Diminuisce di 1
            } else if (e.target.classList.contains('cart-remove')) {
                removeItem(itemId); // Rimuovi completamente
            }
        });
    });
}
    
    // Disabilita il pulsante se il carrello è vuoto
    sendOrderBtn.disabled = cart.length === 0;

    cart.forEach(item => {
        const li = document.createElement('li');
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        li.textContent = `${item.quantity} x ${item.name} (€${item.price.toFixed(2)}) - Totale: €${itemTotal.toFixed(2)}`;
        cartList.appendChild(li);
    });

    totalPriceSpan.textContent = total.toFixed(2);
}

// NUOVA FUNZIONE: Raggruppa gli articoli per categoria
function groupItemsByCategory(items) {
    return items.reduce((acc, item) => {
        const category = item.category || 'Altro'; // Usa 'Altro' se la categoria è mancante
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(item);
        return acc;
    }, {});
} 
// FUNZIONE MODIFICATA: Visualizza il menu raggruppato
function renderMenu(groupedItems) {
    menuContainer.innerHTML = ''; // Pulisce il container

    // Ottieni le categorie in ordine alfabetico (opzionale)
    const sortedCategories = Object.keys(groupedItems).sort();

    sortedCategories.forEach(category => {
        const categorySection = document.createElement('section');
        categorySection.id = `category-${category.replace(/\s/g, '_')}`; // ID pulito
        categorySection.innerHTML = `<h2>${category}</h2>`;
        
        const itemsListDiv = document.createElement('div');
        itemsListDiv.className = 'category-items'; 
        // Aggiungiamo uno stile per layout a griglia qui

        groupedItems[category].forEach(item => {
            const div = document.createElement('div');
            div.className = 'menu-item';
            div.innerHTML = `
                <div>
                    <strong>${item.name}</strong><br>
                    <span>€${item.price.toFixed(2)}</span>
                </div>
                <button data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">
                    Aggiungi
                </button>
            `;
            
            // Aggiungi l'evento al pulsante (come prima)
            const btn = div.querySelector('button');
            btn.addEventListener('click', () => {
                addToCart({
                    id: item.id,
                    name: item.name,
                    price: item.price
                });
            });

            itemsListDiv.appendChild(div);
        });
        
        categorySection.appendChild(itemsListDiv);
        menuContainer.appendChild(categorySection);
    });
}
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.innerHTML = `
            <div>
                <strong>${item.name}</strong><br>
                <span>€${item.price.toFixed(2)} (${item.category})</span>
            </div>
            <button data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">
                Aggiungi
            </button>
        `;
        
        // Aggiungi l'evento al pulsante
        const btn = div.querySelector('button');
        btn.addEventListener('click', () => {
            // Quando si clicca, aggiungi l'oggetto al carrello
            addToCart({
                id: item.id,
                name: item.name,
                price: item.price
            });
        });

        menuContainer.appendChild(div);
    });
}

// FUNZIONE MODIFICATA: Legge il menu da Firestore
async function fetchMenu() {
    try {
        const snapshot = await db.collection('menu').get();
        const menuItems = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // NUOVO PASSO: Raggruppa gli articoli
        const groupedItems = groupItemsByCategory(menuItems);
        
        console.log("Menu caricato e raggruppato:", groupedItems);
        renderMenu(groupedItems); // Passa gli articoli raggruppati

    } catch (error) {
        console.error("Errore nel caricamento del menu: ", error);
        menuContainer.innerHTML = '<p style="color:red;">Impossibile caricare il menu. Controlla la connessione a Firebase.</p>';
    }
}

// Invia l'ordine a Firestore
async function sendOrder() {
    if (cart.length === 0) {
        alert("Il carrello è vuoto!");
        return;
    }

    sendOrderBtn.disabled = true;
    sendOrderBtn.textContent = 'Invio in corso...';
    
    const orderData = {
        tableId: tableId,
        items: cart,
        total: parseFloat(totalPriceSpan.textContent),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending' // Stato iniziale dell'ordine
    };
    
    try {
        // Scrive il nuovo ordine nella raccolta 'orders'
        await db.collection('orders').add(orderData);
        
        alert(`Ordine inviato con successo al Tavolo ${tableId}!`);
        // Pulisce il carrello dopo l'invio
        cart = [];
        renderCart(); 

    } catch (error) {
        console.error("Errore nell'invio dell'ordine: ", error);
        alert("Si è verificato un errore durante l'invio dell'ordine.");
    } finally {
        sendOrderBtn.disabled = false;
        sendOrderBtn.textContent = 'Invia Ordine';
    }
}

// --- 4. INIZIALIZZAZIONE ---

document.addEventListener('DOMContentLoaded', () => {
    getTableIdFromUrl();
    fetchMenu();
    renderCart(); // Per inizializzare la visualizzazione

    // Aggiunge l'evento al pulsante di invio
    sendOrderBtn.addEventListener('click', sendOrder);
});
