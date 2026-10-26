/* If Chart.js can't load (offline / blocked CDN) don't let that break the rest of the page */
if (typeof Chart === "undefined") {
    window.Chart = function () { this.update = function () {}; this.destroy = function () {}; };
    window.Chart.defaults = { color: "", font: {}, plugins: { legend: { labels: {} } } };
}

/* ============================================================
   ELARA SHOPPING DASHBOARD
   dashboard-shopping.js
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {

    /* =========================================================
       DATA
       ========================================================= */

    let shoppingItems = JSON.parse(
        localStorage.getItem("elaraShoppingItems")
    ) || (window.ElaraData && !ElaraData.demo ? [] : [
        {
            id: 1,
            name: "Milk",
            details: "2 Litres • Woolworths",
            price: 38.99,
            category: "Groceries",
            status: "Pending",
            icon: "fa-cart-shopping"
        },
        {
            id: 2,
            name: "Eggs",
            details: "30 Pack",
            price: 79.99,
            category: "Groceries",
            status: "Pending",
            icon: "fa-egg"
        },
        {
            id: 3,
            name: "Dishwashing Liquid",
            details: "750ml",
            price: 42.50,
            category: "Cleaning",
            status: "Pending",
            icon: "fa-bottle-water"
        }
    ]);

    let cartItems = JSON.parse(
        localStorage.getItem("elaraCartItems")
    ) || [];

    let activities = JSON.parse(
        localStorage.getItem("elaraShoppingActivities")
    ) || [];

    let receipts = JSON.parse(
        localStorage.getItem("elaraReceipts")
    ) || (window.ElaraData && !ElaraData.demo ? [] : [
        {
            id: 1,
            store: "Checkers",
            description: "Original email receipt"
        },
        {
            id: 2,
            store: "Makro",
            description: "Scanned receipt"
        }
    ]);


    /* =========================================================
       SAVE DATA
       ========================================================= */

    function saveData() {

        localStorage.setItem(
            "elaraShoppingItems",
            JSON.stringify(shoppingItems)
        );

        localStorage.setItem(
            "elaraCartItems",
            JSON.stringify(cartItems)
        );

        localStorage.setItem(
            "elaraShoppingActivities",
            JSON.stringify(activities)
        );

        localStorage.setItem(
            "elaraReceipts",
            JSON.stringify(receipts)
        );
    }


    /* =========================================================
       HELPERS
       ========================================================= */

    function formatMoney(amount) {

        return "R" + Number(amount).toLocaleString("en-ZA", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    }


    function escapeHTML(text) {

        const div = document.createElement("div");

        div.textContent = text;

        return div.innerHTML;

    }


    function showNotification(message, type = "success") {

        let notification =
            document.getElementById("shoppingNotification");

        if (!notification) {

            notification = document.createElement("div");

            notification.id = "shoppingNotification";

            document.body.appendChild(notification);

            notification.style.position = "fixed";
            notification.style.top = "25px";
            notification.style.right = "25px";
            notification.style.padding = "15px 20px";
            notification.style.borderRadius = "14px";
            notification.style.color = "#fff";
            notification.style.fontSize = "14px";
            notification.style.fontWeight = "500";
            notification.style.zIndex = "99999";
            notification.style.boxShadow =
                "0 10px 30px rgba(0,0,0,.25)";
            notification.style.transition = "all .3s ease";

        }

        notification.textContent = message;

        notification.style.background =
            type === "error"
                ? "#ef4444"
                : "#6C63FF";

        notification.style.opacity = "1";
        notification.style.transform = "translateY(0)";

        clearTimeout(window.shoppingNotificationTimer);

        window.shoppingNotificationTimer =
            setTimeout(() => {

                notification.style.opacity = "0";
                notification.style.transform =
                    "translateY(-10px)";

            }, 2500);

    }


    /* =========================================================
       ACTIVITY
       ========================================================= */

    function addActivity(icon, text) {

        activities.unshift({
            id: Date.now(),
            icon,
            text,
            time: "Just now"
        });

        // Keep latest 10
        activities = activities.slice(0, 10);

        saveData();

        renderActivities();

    }


    function renderActivities() {

        const activityPanel =
            document.querySelector(".recent-panel");

        if (!activityPanel) return;

        const items =
            activityPanel.querySelectorAll(".activity-item");

        items.forEach(item => item.remove());

        if (activities.length === 0) {

            const empty = document.createElement("p");

            empty.className = "empty-activity";

            empty.textContent =
                "No recent shopping activity.";

            empty.style.color = "var(--text2)";

            activityPanel.appendChild(empty);

            return;

        }

        activities.forEach(activity => {

            const item = document.createElement("div");

            item.className = "activity-item";

            item.innerHTML = `
                <i class="fa-solid ${escapeHTML(activity.icon)}"></i>

                ${escapeHTML(activity.text)}

                <span>${escapeHTML(activity.time)}</span>
            `;

            activityPanel.appendChild(item);

        });

    }


    /* =========================================================
       SHOPPING LIST
       ========================================================= */

    function renderShoppingItems() {

        const panels =
            document.querySelectorAll(".shopping-left .panel");

        if (!panels.length) return;

        const shoppingPanel = panels[0];

        const existingItems =
            shoppingPanel.querySelectorAll(".shopping-item");

        existingItems.forEach(item => item.remove());

        const header =
            shoppingPanel.querySelector(".panel-header");

        if (header) {

            const count =
                header.querySelector("span");

            if (count) {

                count.textContent =
                    `${shoppingItems.length} Items`;

            }

        }

        if (shoppingItems.length === 0) {

            const empty = document.createElement("div");

            empty.className = "empty-shopping";

            empty.innerHTML = `
                <i class="fa-solid fa-cart-shopping"></i>
                <p>Your shopping list is empty.</p>
            `;

            empty.style.textAlign = "center";
            empty.style.padding = "30px";
            empty.style.color = "var(--text2)";

            shoppingPanel.appendChild(empty);

            return;

        }

        shoppingItems.forEach(item => {

            const row =
                document.createElement("div");

            row.className = "shopping-item";

            row.dataset.id = item.id;

            row.innerHTML = itemRowHTML(item);

            shoppingPanel.appendChild(row);

        });

        attachCartButtons();

    }


    /* =========================================================
       ADD TO CART
       ========================================================= */

    function attachCartButtons() {

        const buttons =
            document.querySelectorAll(".add-cart-btn");

        buttons.forEach(button => {

            button.addEventListener("click", () => {

                const id =
                    Number(button.dataset.id);

                const item =
                    shoppingItems.find(
                        product => product.id === id
                    );

                if (!item) return;

                const alreadyInCart =
                    cartItems.some(
                        product => product.id === id
                    );

                if (alreadyInCart) {

                    showNotification(
                        `${item.name} is already in your cart.`,
                        "error"
                    );

                    return;

                }

                item.addedAt = Date.now();
                cartItems.push(item);

                saveData();

                button.textContent = "Added ✓";

                button.disabled = true;

                button.style.opacity = ".6";

                addActivity(
                    "fa-cart-plus",
                    `Added ${item.name} to cart`
                );

                showNotification(
                    `${item.name} added to cart.`
                );

                updateStatistics();

                refreshList();

            });

        });

    }


    /* =========================================================
       STATISTICS
       ========================================================= */

    function updateStatistics() {

        renderPriceWatch();

        const itemCount =
            document.getElementById("itemCount");

        if (itemCount) {

            itemCount.textContent =
                shoppingItems.length;

        }


        const monthlySpending =
            document.getElementById("monthlySpending");

        if (monthlySpending) {

            const nowD = new Date();
            const total =
                cartItems.reduce(
                    (sum, item) => {
                        const d = new Date(item.addedAt || Date.now());
                        return (d.getMonth() === nowD.getMonth() && d.getFullYear() === nowD.getFullYear())
                            ? sum + Number(item.price) : sum;
                    },
                    0
                );
            if (window.refreshSpendingChart) window.refreshSpendingChart();
            monthlySpending.textContent =
                formatMoney(total);

        }


        const lowStock =
            document.getElementById("lowStock");

        if (lowStock) {

            // Items predicted to run out soon (from real purchase history)
            lowStock.textContent =
                computePredictions().filter(p => p.level === "overdue" || p.level === "soon").length;

        }


        const savedMoney =
            document.getElementById("savedMoney");

        if (savedMoney) {

            // Demo saving calculation
            const savings =
                cartItems.length * 15;

            savedMoney.textContent =
                formatMoney(savings);

        }

        renderPredictions();

    }


    /* =========================================================
       PRODUCT SEARCH
       ========================================================= */

    function setupProductSearch() {

        const input =
            document.querySelector(".product-search input");

        if (!input) return;

        input.addEventListener("input", () => {

            const search =
                input.value.toLowerCase().trim();

            const rows =
                document.querySelectorAll(".shopping-item");

            rows.forEach(row => {

                const text =
                    row.textContent.toLowerCase();

                row.style.display =
                    text.includes(search)
                        ? ""
                        : "none";

            });

        });

    }


    /* =========================================================
       CATEGORY + SORT
       ========================================================= */

    function setupFilters() {

        const selects =
            document.querySelectorAll(
                ".shopping-controls select"
            );

        if (selects.length < 2) return;

        const categorySelect = selects[0];

        const sortSelect = selects[1];


        // CATEGORY

        categorySelect.addEventListener(
            "change",
            applyFilters
        );


        // SORT

        sortSelect.addEventListener(
            "change",
            applyFilters
        );


        function applyFilters() {

            let filtered =
                [...shoppingItems];


            const category =
                categorySelect.value;


            if (
                category &&
                category !== "Category"
            ) {

                filtered =
                    filtered.filter(
                        item =>
                            item.category === category
                    );

            }


            const sort =
                sortSelect.value;


            if (sort === "Newest") {

                filtered.sort(
                    (a, b) =>
                        Number(b.id) - Number(a.id)
                );

            }


            if (sort === "Price: Low to High") {

                filtered.sort(
                    (a, b) =>
                        a.price - b.price
                );

            }


            if (sort === "Price: High to Low") {

                filtered.sort(
                    (a, b) =>
                        b.price - a.price
                );

            }


            renderFilteredItems(filtered);

        }

    }


    function renderFilteredItems(items) {

        const panel =
            document.querySelector(
                ".shopping-left .panel"
            );

        if (!panel) return;

        panel
            .querySelectorAll(".shopping-item")
            .forEach(item => item.remove());


        items.forEach(item => {

            const row =
                document.createElement("div");

            row.className = "shopping-item";

            row.dataset.id = item.id;

            const inCart =
                cartItems.some(
                    cart => cart.id === item.id
                );

            row.innerHTML = itemRowHTML(item);

            panel.appendChild(row);

        });

        attachCartButtons();

    }


    /* =========================================================
       ADD ITEM MODAL
       ========================================================= */

    /* =========================================================
       ITEM ROWS + ACTIONS (view, edit, delete, cart)
       ========================================================= */

    function iconFor(category) {
        return category === "Cleaning" ? "fa-bottle-water"
            : category === "Electronics" ? "fa-plug"
            : category === "Personal Care" ? "fa-pump-soap"
            : "fa-cart-shopping";
    }

    function itemRowHTML(item) {
        const inCart = cartItems.some(c => c.id === item.id);
        const id = item.id;
        const nm = escapeHTML(item.name);
        return `
            <div class="item-info">
                <i class="fa-solid ${escapeHTML(item.icon)}"></i>
                <div>
                    <h3>${nm}</h3>
                    <p>${escapeHTML(item.details)}</p>
                </div>
            </div>
            <div class="item-right">
                <span class="price">${formatMoney(item.price)}</span>
                <button class="add-cart-btn" data-id="${id}" ${inCart ? "disabled" : ""}>
                    ${inCart ? "Added ✓" : "Add to Cart"}
                </button>
                <div class="item-actions">
                    <button class="icon-act item-view" data-id="${id}" title="View details" aria-label="View ${nm}"><i class="fa-solid fa-eye"></i></button>
                    <button class="icon-act item-edit" data-id="${id}" title="Edit" aria-label="Edit ${nm}"><i class="fa-solid fa-pen"></i></button>
                    ${inCart ? `
                    <button class="icon-act item-again" data-id="${id}" title="Add again to the list" aria-label="Add ${nm} again"><i class="fa-solid fa-rotate-right"></i></button>
                    <button class="icon-act item-uncart" data-id="${id}" title="Remove from cart" aria-label="Remove ${nm} from cart"><i class="fa-solid fa-cart-arrow-down"></i></button>` : ""}
                    <button class="icon-act danger item-del" data-id="${id}" title="Delete" aria-label="Delete ${nm}"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
    }

    // re-draw the list but keep the category / sort / search the user chose
    function refreshList() {
        const sel = document.querySelectorAll(".shopping-controls select");
        const filtered = sel.length >= 2 &&
            ((sel[0].value && sel[0].value !== "Category") || (sel[1].value && sel[1].value !== "Sort By"));
        if (filtered) sel[0].dispatchEvent(new Event("change"));
        else renderShoppingItems();
        const q = document.querySelector(".product-search input");
        if (q && q.value) q.dispatchEvent(new Event("input"));
    }

    function findItem(id) {
        return shoppingItems.find(x => x.id === Number(id));
    }

    function openItemDetails(item) {
        addModalStyles();
        const cart = cartItems.find(c => c.id === item.id);
        const when = t => new Date(t).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
        const rows = [
            ["Details", item.details],
            ["Category", item.category || "—"],
            ["Price", formatMoney(item.price)],
            ["Status", cart ? "In your cart" : "On your list"],
            ["Added to list", Number(item.id) > 1e12 ? when(Number(item.id)) : "—"],
            ["Added to cart", cart && cart.addedAt ? when(cart.addedAt) : "—"]
        ];
        const modal = document.createElement("div");
        modal.id = "itemDetailsModal";
        modal.innerHTML = `
            <div class="shopping-modal-overlay">
                <div class="shopping-modal">
                    <div class="modal-header">
                        <h2>${escapeHTML(item.name)}</h2>
                        <button class="close-details" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="detail-list">
                        ${rows.map(r => `<div class="detail-row"><span>${r[0]}</span><strong>${escapeHTML(r[1])}</strong></div>`).join("")}
                    </div>
                    <div class="detail-actions">
                        <button class="detail-edit"><i class="fa-solid fa-pen"></i> Edit</button>
                        <button class="detail-del"><i class="fa-solid fa-trash"></i> Delete</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelector(".close-details").onclick = close;
        modal.querySelector(".shopping-modal-overlay").addEventListener("click", e => {
            if (e.target.classList.contains("shopping-modal-overlay")) close();
        });
        modal.querySelector(".detail-edit").onclick = () => { close(); openAddItemModal(item); };
        modal.querySelector(".detail-del").onclick = () => { close(); deleteItem(item); };
    }

    /* themed confirmation (ElaraUI.confirm from elara-common.js), falls back to the browser one */
    function askConfirm(opts) {
        if (window.ElaraUI && ElaraUI.confirm) return ElaraUI.confirm(opts);
        return Promise.resolve(window.confirm(opts.message || opts.title));
    }

    async function deleteItem(item) {
        const inCart = cartItems.some(c => c.id === item.id);
        const msg = inCart
            ? `\u201c${item.name}\u201d will be removed from your shopping list and cart, and its spending will be taken off your totals.`
            : `\u201c${item.name}\u201d will be removed from your shopping list.`;
        const ok = await askConfirm({ title: "Delete this item?", message: msg, confirmText: "Delete item", icon: "fa-trash-can" });
        if (!ok) return;
        shoppingItems = shoppingItems.filter(x => x.id !== item.id);
        cartItems = cartItems.filter(c => c.id !== item.id);
        saveData();
        refreshList();
        updateStatistics();
        addActivity("fa-trash", `Deleted ${item.name}`);
        showNotification(`${item.name} deleted.`);
    }

    function setupItemActions() {
        document.addEventListener("click", e => {
            const b = e.target.closest(".icon-act");
            if (!b) return;
            const item = findItem(b.dataset.id);
            if (!item) return;

            if (b.classList.contains("item-view")) openItemDetails(item);
            else if (b.classList.contains("item-edit")) openAddItemModal(item);
            else if (b.classList.contains("item-del")) deleteItem(item);
            else if (b.classList.contains("item-uncart")) {
                cartItems = cartItems.filter(c => c.id !== item.id);
                saveData();
                refreshList();
                updateStatistics();
                addActivity("fa-cart-arrow-down", `Removed ${item.name} from cart`);
                showNotification(`${item.name} removed from your cart.`);
            }
            else if (b.classList.contains("item-again")) {
                const copy = Object.assign({}, item, { id: Date.now(), status: "Pending" });
                delete copy.addedAt;
                shoppingItems.push(copy);
                saveData();
                refreshList();
                updateStatistics();
                addActivity("fa-rotate-right", `Added ${item.name} to the list again`);
                showNotification(`${item.name} added to your list again.`);
            }
        });
    }


    function setupAddItem() {

        const addButton =
            document.querySelector(".add-item");

        if (!addButton) return;

        addButton.addEventListener("click", () => openAddItemModal());

    }


    function openAddItemModal(editItem) {

        const modal =
            document.createElement("div");

        modal.id = "addItemModal";

        modal.innerHTML = `

            <div class="shopping-modal-overlay">

                <div class="shopping-modal">

                    <div class="modal-header">

                        <h2>${editItem ? "Edit Shopping Item" : "Add Shopping Item"}</h2>

                        <button id="closeShoppingModal">
                            <i class="fa-solid fa-xmark"></i>
                        </button>

                    </div>

                    <form id="shoppingItemForm">

                        <label>
                            Product Name
                        </label>

                        <input
                            type="text"
                            id="newItemName"
                            placeholder="e.g. Bread"
                            required
                        >

                        <label>
                            Details
                        </label>

                        <input
                            type="text"
                            id="newItemDetails"
                            placeholder="e.g. Brown bread"
                            required
                        >

                        <label>
                            Price
                        </label>

                        <input
                            type="number"
                            id="newItemPrice"
                            placeholder="e.g. 25.99"
                            min="0"
                            step="0.01"
                            required
                        >

                        <label>
                            Category
                        </label>

                        <select id="newItemCategory">

                            <option value="Groceries">
                                Groceries
                            </option>

                            <option value="Cleaning">
                                Cleaning
                            </option>

                            <option value="Household">
                                Household
                            </option>

                            <option value="Electronics">
                                Electronics
                            </option>

                            <option value="Personal Care">
                                Personal Care
                            </option>

                        </select>

                        <button type="submit">
                            <i class="fa-solid ${editItem ? "fa-floppy-disk" : "fa-plus"}"></i>
                            ${editItem ? "Save Changes" : "Add Item"}
                        </button>

                    </form>

                </div>

            </div>

        `;

        document.body.appendChild(modal);

        addModalStyles();

        if (editItem) {
            document.getElementById("newItemName").value = editItem.name;
            document.getElementById("newItemDetails").value = editItem.details;
            document.getElementById("newItemPrice").value = editItem.price;
            document.getElementById("newItemCategory").value = editItem.category || "Groceries";
        }

        document
            .getElementById("closeShoppingModal")
            .addEventListener(
                "click",
                () => modal.remove()
            );


        document
            .querySelector(".shopping-modal-overlay")
            .addEventListener(
                "click",
                event => {

                    if (
                        event.target.classList.contains(
                            "shopping-modal-overlay"
                        )
                    ) {

                        modal.remove();

                    }

                }
            );


        document
            .getElementById("shoppingItemForm")
            .addEventListener(
                "submit",
                event => {

                    event.preventDefault();

                    const name =
                        document.getElementById(
                            "newItemName"
                        ).value.trim();

                    const details =
                        document.getElementById(
                            "newItemDetails"
                        ).value.trim();

                    const price =
                        Number(
                            document.getElementById(
                                "newItemPrice"
                            ).value
                        );

                    const category =
                        document.getElementById(
                            "newItemCategory"
                        ).value;


                    if (
                        !name ||
                        !details ||
                        price < 0
                    ) {

                        showNotification(
                            "Please complete all fields.",
                            "error"
                        );

                        return;

                    }


                    if (editItem) {

                        [shoppingItems, cartItems].forEach(list => {
                            list.forEach(x => {
                                if (x.id === editItem.id) {
                                    x.name = name;
                                    x.details = details;
                                    x.price = price;
                                    x.category = category;
                                    x.icon = iconFor(category);
                                }
                            });
                        });

                        saveData();
                        refreshList();
                        updateStatistics();
                        addActivity("fa-pen", `Updated ${name}`);
                        showNotification(`${name} updated.`);
                        modal.remove();
                        return;

                    }

                    const newItem = {
                        id: Date.now(),
                        name,
                        details,
                        price,
                        category,
                        status: "Pending",
                        icon: iconFor(category)
                    };

                    shoppingItems.push(newItem);
                    saveData();
                    refreshList();
                    updateStatistics();
                    addActivity(
                        "fa-cart-plus",
                        `Added ${name} to shopping list`
                    );
                    showNotification(
                        `${name} added to shopping list.`
                    );
                    modal.remove();
                }
            );
    }


    /* =========================================================
       MODAL STYLING
       ========================================================= */

    function addModalStyles() {

        if (
            document.getElementById(
                "shoppingModalStyles"
            )
        ) return;


        const style =
            document.createElement("style");

        style.id =
            "shoppingModalStyles";


        style.textContent = `

            .shopping-modal-overlay {

                position: fixed;
                inset: 0;

                background:
                    rgba(0,0,0,.65);

                backdrop-filter:
                    blur(8px);

                display: flex;

                align-items: center;
                justify-content: center;

                z-index: 9999;

                padding: 20px;

            }


            .shopping-modal {

                width: 100%;
                max-width: 500px;

                background:
                    #12162a;

                border:
                    1px solid rgba(255,255,255,.1);

                border-radius: 24px;

                padding: 28px;

                box-shadow:
                    0 25px 70px
                    rgba(0,0,0,.45);

                color: white;

            }


            .modal-header {

                display: flex;

                justify-content:
                    space-between;

                align-items: center;

                margin-bottom: 25px;

            }


            .modal-header h2 {

                margin: 0;

            }


            #closeShoppingModal {

                width: 40px;
                height: 40px;

                border: none;

                border-radius: 12px;

                background:
                    rgba(255,255,255,.08);

                color: white;

                cursor: pointer;

                font-size: 18px;

            }


            #shoppingItemForm {

                display: flex;

                flex-direction: column;

                gap: 10px;

            }


            #shoppingItemForm label {

                margin-top: 8px;

                color: #9BA6C6;

                font-size: 14px;

            }


            #shoppingItemForm input,
            #shoppingItemForm select {

                width: 100%;

                padding: 14px;

                border-radius: 12px;

                border:
                    1px solid
                    rgba(255,255,255,.1);

                background:
                    #1a1f36;

                color: white;

                outline: none;

            }


            #shoppingItemForm button {

                margin-top: 15px;

                padding: 14px;

                border: none;

                border-radius: 14px;

                background:
                    linear-gradient(
                        135deg,
                        #6C63FF,
                        #4F46E5
                    );

                color: white;

                font-size: 15px;

                cursor: pointer;

            }


            body.light-theme
            .shopping-modal {

                background: white;

                color: #17182b;

                border-color:
                    rgba(0,0,0,.08);

            }


            body.light-theme
            #closeShoppingModal {

                background:
                    #eef0f7;

                color: #17182b;

            }


            body.light-theme
            #shoppingItemForm input,
            body.light-theme
            #shoppingItemForm select {

                background: white;

                color: #17182b;

                border-color:
                    rgba(0,0,0,.1);

            }

        `;


        document.head.appendChild(style);

    }


    /* =========================================================
       RECEIPT UPLOAD
       ========================================================= */

    function setupReceiptUpload() {

        const uploadButton =
            document.querySelector(".upload-btn");

        if (!uploadButton) return;


        const fileInput =
            document.createElement("input");

        fileInput.type = "file";

        fileInput.accept =
            "image/*,.pdf";

        fileInput.style.display = "none";

        document.body.appendChild(fileInput);


        uploadButton.addEventListener(
            "click",
            () => fileInput.click()
        );


        fileInput.addEventListener(
            "change",
            () => {

                const file =
                    fileInput.files[0];

                if (!file) return;


                addReceiptFile(
                    file,
                    file.name,
                    "Uploaded receipt",
                    "fa-file-arrow-up",
                    `Uploaded ${file.name}`,
                    "Receipt uploaded successfully."
                );

                fileInput.value = "";

            }
        );

    }


    /* =========================================================
       SCAN RECEIPT
       ========================================================= */

    function setupReceiptScanner() {

        const scanButton =
            document.querySelector(".scan-btn");

        if (!scanButton) return;


        scanButton.addEventListener(
            "click",
            () => {

                showNotification(
                    "Receipt scanner opened."
                );


                // Camera input
                const camera =
                    document.createElement("input");

                camera.type = "file";

                camera.accept = "image/*";

                camera.capture = "environment";

                camera.style.display = "none";

                document.body.appendChild(camera);

                camera.click();


                camera.addEventListener(
                    "change",
                    () => {

                        const file =
                            camera.files[0];

                        if (!file) {

                            camera.remove();

                            return;

                        }


                        addReceiptFile(
                            file,
                            "Scanned Receipt",
                            "Scanned " + new Date().toLocaleDateString("en-ZA"),
                            "fa-camera",
                            "Scanned a receipt",
                            "Receipt scanned successfully."
                        );


                        camera.remove();

                    }
                );

            }
        );

    }


    /* =========================================================
       RECEIPT FILES (kept in IndexedDB so big photos / PDFs fit)
       ========================================================= */

    const RDB = (function () {
        const uid = (window.ElaraData && ElaraData.user && ElaraData.user.id) || "guest";
        let dbp = null;
        function open() {
            if (dbp) return dbp;
            dbp = new Promise((res, rej) => {
                const r = indexedDB.open("elaraReceiptFiles:" + uid, 1);
                r.onupgradeneeded = () => r.result.createObjectStore("files");
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
            });
            return dbp;
        }
        function run(mode, fn) {
            return open().then(db => new Promise((res, rej) => {
                const t = db.transaction("files", mode);
                const req = fn(t.objectStore("files"));
                t.oncomplete = () => res(req && req.result);
                t.onerror = () => rej(t.error);
            }));
        }
        return {
            put: (id, blob) => run("readwrite", s => s.put(blob, id)),
            get: id => run("readonly", s => s.get(id)),
            del: id => run("readwrite", s => s.delete(id))
        };
    })();

    function addReceiptFile(file, store, description, icon, activityText, doneMessage) {
        const id = Date.now();
        RDB.put(id, file).then(() => {
            receipts.unshift({
                id,
                store,
                description,
                fileName: file.name,
                mime: file.type || "",
                size: file.size,
                hasFile: true
            });
            receipts.slice(20).forEach(r => RDB.del(r.id).catch(() => {}));
            receipts = receipts.slice(0, 20);
            saveData();
            renderReceipts();
            addActivity(icon, activityText);
            showNotification(doneMessage);
        }).catch(() => {
            showNotification("Could not store this receipt file. Your browser may be blocking storage.", "error");
        });
    }

    function openReceiptViewer(receipt) {
        const old = document.getElementById("receiptViewer");
        if (old) old.remove();

        const light = document.body.classList.contains("light-theme");
        const bg = light ? "#ffffff" : "#10142b";
        const fg = light ? "#17182b" : "#ffffff";
        const sub = light ? "#68708a" : "#9BA6C6";

        const overlay = document.createElement("div");
        overlay.id = "receiptViewer";
        overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(3,4,14,.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px";

        const box = document.createElement("div");
        box.style.cssText = "background:" + bg + ";color:" + fg + ";border-radius:20px;width:min(760px,100%);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden";

        const head = document.createElement("div");
        head.style.cssText = "display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid rgba(128,128,160,.25)";
        const titles = document.createElement("div");
        titles.style.cssText = "flex:1;min-width:0";
        const h = document.createElement("h3");
        h.textContent = receipt.store;
        h.style.cssText = "margin:0 0 4px;font-size:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        const p = document.createElement("p");
        p.textContent = receipt.description + (receipt.fileName && receipt.fileName !== receipt.store ? " • " + receipt.fileName : "");
        p.style.cssText = "margin:0;font-size:13px;color:" + sub;
        titles.append(h, p);
        const x = document.createElement("button");
        x.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        x.setAttribute("aria-label", "Close");
        x.style.cssText = "background:none;border:0;color:" + fg + ";font-size:20px;cursor:pointer";
        head.append(titles, x);

        const body = document.createElement("div");
        body.style.cssText = "flex:1;overflow:auto;padding:18px 22px;display:flex;align-items:center;justify-content:center;min-height:200px";

        const foot = document.createElement("div");
        foot.style.cssText = "display:flex;gap:10px;justify-content:flex-end;padding:14px 22px;border-top:1px solid rgba(128,128,160,.25)";

        function btn(label, icon, bgc) {
            const b = document.createElement(label === "Download" ? "a" : "button");
            b.innerHTML = '<i class="fa-solid ' + icon + '"></i> ' + label;
            b.style.cssText = "display:inline-flex;gap:8px;align-items:center;padding:10px 16px;border-radius:12px;border:0;cursor:pointer;font:600 14px inherit;text-decoration:none;color:#fff;background:" + bgc;
            return b;
        }

        let url = "";
        function close() {
            if (url) URL.revokeObjectURL(url);
            document.removeEventListener("keydown", onKey);
            overlay.remove();
        }
        function onKey(e) { if (e.key === "Escape") close(); }
        document.addEventListener("keydown", onKey);
        x.onclick = close;
        overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

        const del = btn("Delete", "fa-trash", "#e5484d");
        del.onclick = async () => {
            const ok = await askConfirm({ title: "Delete this receipt?", message: `The ${receipt.store} receipt will be removed from your archive.`, confirmText: "Delete receipt", icon: "fa-file-circle-xmark" });
            if (!ok) return;
            RDB.del(receipt.id).catch(() => {});
            receipts = receipts.filter(r => r.id !== receipt.id);
            saveData();
            renderReceipts();
            addActivity("fa-trash", `Deleted receipt ${receipt.store}`);
            close();
        };
        foot.append(del);

        function message(text) {
            const m = document.createElement("p");
            m.textContent = text;
            m.style.cssText = "color:" + sub + ";text-align:center;max-width:420px;line-height:1.5";
            body.appendChild(m);
        }

        document.body.appendChild(overlay);
        box.append(head, body, foot);
        overlay.appendChild(box);

        if (!receipt.hasFile) {
            message("No file was saved for this receipt. It was added before receipts could be viewed. Please upload it again to keep a copy.");
            return;
        }

        RDB.get(receipt.id).then(blob => {
            if (!blob) {
                message("This receipt's file isn't on this device. It was uploaded from another browser or device.");
                return;
            }
            url = URL.createObjectURL(blob);
            const type = blob.type || receipt.mime || "";
            const isPdf = type === "application/pdf" || /\.pdf$/i.test(receipt.fileName || "");
            if (isPdf) {
                const f = document.createElement("iframe");
                f.src = url;
                f.style.cssText = "width:100%;height:70vh;border:0;border-radius:10px;background:#fff";
                body.appendChild(f);
            } else {
                const img = document.createElement("img");
                img.src = url;
                img.alt = receipt.store;
                img.style.cssText = "max-width:100%;max-height:70vh;border-radius:10px;object-fit:contain";
                img.onerror = () => { img.remove(); message("This file can't be previewed here. Use Download to open it."); };
                body.appendChild(img);
            }
            const dl = btn("Download", "fa-download", "#6C63FF");
            dl.href = url;
            dl.download = receipt.fileName || receipt.store;
            foot.insertBefore(dl, del);
        }).catch(() => message("Could not open this receipt file."));
    }


    /* =========================================================
       INVENTORY PREDICTIONS (from the user's own list + cart)
       ========================================================= */

    const DAY = 86400000;

    function normName(n) {
        return String(n || "").toLowerCase().replace(/\s+/g, " ").trim();
    }

    function computePredictions() {
        const now = Date.now();
        const out = [];

        // group "Add to Cart" events by product name
        const groups = {};
        cartItems.forEach(c => {
            const k = normName(c.name);
            if (!k) return;
            (groups[k] = groups[k] || { name: c.name, times: [] }).times.push(Number(c.addedAt) || now);
        });

        Object.values(groups).forEach(g => {
            const t = g.times.sort((a, b) => a - b);
            const last = t[t.length - 1];
            const sinceLast = Math.max(0, Math.floor((now - last) / DAY));
            if (t.length >= 2) {
                const gaps = [];
                for (let i = 1; i < t.length; i++) gaps.push((t[i] - t[i - 1]) / DAY);
                const avg = Math.max(1, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length));
                const left = Math.round(avg - (now - last) / DAY);
                const basis = `bought ${t.length} times, about every ${avg} day${avg === 1 ? "" : "s"}`;
                if (left < 0) {
                    out.push({ rank: 0, level: "overdue", icon: "fa-triangle-exclamation", color: "#F87171", name: g.name,
                        text: `Probably running out: you've ${basis}, and it was last bought ${sinceLast} day${sinceLast === 1 ? "" : "s"} ago.` });
                } else if (left <= 3) {
                    out.push({ rank: 1, level: "soon", icon: "fa-clock", color: "#FBBF24", name: g.name,
                        text: left === 0 ? `Likely to run out today. You've ${basis}.` : `Estimated to run out in ${left} day${left === 1 ? "" : "s"}. You've ${basis}.`});
                } else {
                    out.push({ rank: 4, level: "ok", icon: "fa-box-open", color: "#34D399", name: g.name,
                        text: `Stock should last about ${left} more days. You've ${basis}.` });
                }
            } else {
                out.push({ rank: 5, level: "learning", icon: "fa-circle-info", color: "#60A5FA", name: g.name,
                    text: `Bought once, ${sinceLast} day${sinceLast === 1 ? "" : "s"} ago. Buy it again and Elara will learn how often you need it.` });
            }
        });

        // items waiting on the list, never put in the cart
        shoppingItems.forEach(item => {
            if (cartItems.some(c => c.id === item.id)) return;
            if (groups[normName(item.name)]) return;
            const listed = Number(item.id);
            if (!(listed > 1e12)) return;
            const days = Math.floor((now - listed) / DAY);
            if (days >= 3) {
                out.push({ rank: 2, level: "waiting", icon: "fa-hourglass-half", color: "#FBBF24", name: item.name,
                    text: `On your list for ${days} days and not in your cart yet.` });
            }
        });

        // category spending, this month vs last month
        const nd = new Date(now);
        const thisM = {}, lastM = {};
        cartItems.forEach(c => {
            const d = new Date(Number(c.addedAt) || now);
            const cat = c.category || "Other";
            const price = Number(c.price) || 0;
            if (d.getFullYear() === nd.getFullYear() && d.getMonth() === nd.getMonth()) thisM[cat] = (thisM[cat] || 0) + price;
            else {
                const prev = new Date(nd.getFullYear(), nd.getMonth() - 1, 1);
                if (d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth()) lastM[cat] = (lastM[cat] || 0) + price;
            }
        });
        Object.keys(lastM).forEach(cat => {
            if (!lastM[cat] || thisM[cat] === undefined) return;
            const change = Math.round((thisM[cat] - lastM[cat]) / lastM[cat] * 100);
            if (Math.abs(change) >= 20) {
                out.push({ rank: 3, level: "trend", icon: "fa-chart-line", color: change > 0 ? "#F87171" : "#34D399", name: cat + " spending",
                    text: `${change > 0 ? "Up" : "Down"} ${Math.abs(change)}% on last month (${formatMoney(lastM[cat])} → ${formatMoney(thisM[cat])}).` });
            }
        });

        return out.sort((a, b) => a.rank - b.rank);
    }

    function renderPredictions() {
        const panels = document.querySelectorAll(".shopping-left .panel");
        if (panels.length < 2) return;
        const panel = panels[1];

        panel.querySelectorAll(".prediction, .prediction-empty").forEach(n => n.remove());

        const list = computePredictions().slice(0, 6);

        if (!list.length) {
            const empty = document.createElement("p");
            empty.className = "prediction-empty";
            empty.textContent = "No predictions yet. Add items to your list and put them in your cart. Once you've bought the same item twice, Elara estimates when you'll run out.";
            empty.style.cssText = "color:var(--text2);padding:18px 0;line-height:1.5";
            panel.appendChild(empty);
            return;
        }

        list.forEach(p => {
            const row = document.createElement("div");
            row.className = "prediction";
            row.innerHTML = `
                <i class="fa-solid ${p.icon}" style="color:${p.color}"></i>
                <div>
                    <h3>${escapeHTML(p.name)}</h3>
                    <p>${escapeHTML(p.text)}</p>
                </div>`;
            panel.appendChild(row);
        });
    }


    /* =========================================================
       RECEIPT ARCHIVE
       ========================================================= */

    function renderReceipts() {

        const panels =
            document.querySelectorAll(
                ".shopping-left .panel"
            );

        if (panels.length < 3) return;


        const receiptPanel = panels[2];


        receiptPanel
            .querySelectorAll(".receipt-card")
            .forEach(item => item.remove());


        receipts.forEach(receipt => {

            const card =
                document.createElement("div");

            card.className =
                "receipt-card";


            card.innerHTML = `

                <i class="fa-solid fa-receipt"></i>

                <div>

                    <h3>
                        ${escapeHTML(receipt.store)}
                    </h3>

                    <p>
                        ${escapeHTML(receipt.description)}
                    </p>

                </div>

                <button
                    class="view-receipt"
                    data-id="${receipt.id}">

                    View

                </button>

            `;


            receiptPanel.appendChild(card);

        });


        document
            .querySelectorAll(".view-receipt")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        const id =
                            Number(button.dataset.id);

                        const receipt =
                            receipts.find(
                                item =>
                                    item.id === id
                            );

                        if (!receipt) return;

                        openReceiptViewer(receipt);

                    }
                );

            });

    }


    /* =========================================================
       NOTIFICATION BUTTON
       ========================================================= */

    function setupNotifications() {

        const buttons =
            document.querySelectorAll(
                ".top-actions > button"
            );

        if (!buttons.length) return;


        const notificationButton =
            buttons[0];


        notificationButton.addEventListener(
            "click",
            () => {

                const lowStock =
                    shoppingItems.length > 0
                        ? "You have shopping items that need attention."
                        : "Your shopping list is empty.";


                showNotification(
                    lowStock
                );

            }
        );

    }


    /* =========================================================
       THEME BUTTON
       ========================================================= */

    function setupTheme() {

        const themeButton =
            document.getElementById("themeBtn");


        if (!themeButton) return;


        const icon =
            themeButton.querySelector("i");


        const savedTheme =
            localStorage.getItem(
                "elaraTheme"
            );


        if (savedTheme === "light") {

            document.body.classList.add(
                "light-theme"
            );

            if (icon) {

                icon.classList.remove(
                    "fa-moon"
                );

                icon.classList.add(
                    "fa-sun"
                );

            }

        }


        themeButton.addEventListener(
            "click",
            () => {

                document.body.classList.toggle(
                    "light-theme"
                );


                const light =
                    document.body.classList.contains(
                        "light-theme"
                    );


                localStorage.setItem(
                    "elaraTheme",
                    light
                        ? "light"
                        : "dark"
                );


                if (icon) {

                    icon.classList.toggle(
                        "fa-moon",
                        !light
                    );

                    icon.classList.toggle(
                        "fa-sun",
                        light
                    );

                }

            }
        );

    }


    /* =========================================================
       SPENDING CHART
       ========================================================= */

    function setupChart() {

        const canvas =
            document.getElementById(
                "spendingChart"
            );


        if (!canvas) return;


        if (
            typeof Chart === "undefined"
        ) {

            console.warn(
                "Chart.js is not loaded."
            );

            return;

        }


        const context =
            canvas.getContext("2d");


        function computeMonthly() {
        const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
            months.push({ y: d.getFullYear(), m: d.getMonth(), total: 0 });
        }
        cartItems.forEach(item => {
            const d = new Date(item.addedAt || Date.now());
            const slot = months.find(x => x.y === d.getFullYear() && x.m === d.getMonth());
            if (slot) slot.total += Number(item.price) || 0;
        });
        const monthlyData = {
            labels: months.map(x => monthNames[x.m]),
            datasets: [
                {
                    label: "Shopping Spending",
                    data: months.map(x => +x.total.toFixed(2)),
                    borderWidth: 3,
                    tension: .4,
                    fill: true
                }
            ]
        };
            return monthlyData;
        }
        const monthlyData = computeMonthly();
        window.elaraSpendingChart =
            new Chart(
                context,
                {

                    type: "line",

                    data: monthlyData,

                    options: {

                        responsive: true,

                        maintainAspectRatio:
                            false,

                        plugins: {

                            legend: {

                                display: false

                            }

                        },

                        scales: {

                            y: {

                                beginAtZero: true,

                                ticks: {

                                    callback:
                                        value =>
                                            "R" +
                                            value

                                }

                            }

                        }

                    }

                }
            );

        window.refreshSpendingChart = function () {
            const c = window.elaraSpendingChart;
            if (!c || !c.data) return;
            const fresh = computeMonthly();
            c.data.labels = fresh.labels;
            c.data.datasets[0].data = fresh.datasets[0].data;
            if (c.update) c.update();
        };

    }


    /* =========================================================
       SEARCH TOP BAR
       ========================================================= */

    function setupGlobalSearch() {

        const search =
            document.querySelector(
                ".search input"
            );


        if (!search) return;


        search.addEventListener(
            "input",
            () => {

                const value =
                    search.value
                        .toLowerCase()
                        .trim();


                if (!value) {

                    document
                        .querySelectorAll(
                            ".shopping-item"
                        )
                        .forEach(
                            item =>
                                item.style.display = ""
                        );

                    return;

                }


                document
                    .querySelectorAll(
                        ".shopping-item"
                    )
                    .forEach(item => {

                        const text =
                            item.textContent
                                .toLowerCase();


                        item.style.display =
                            text.includes(value)
                                ? ""
                                : "none";

                    });

            }
        );

    }


    /* =========================================================
       LOGOUT
       ========================================================= */

    function setupLogout() {

        const logout =
            document.querySelector(
                ".logout"
            );


        if (!logout) return;


        logout.addEventListener(
            "click",
            () => {

                const confirmed =
                    confirm(
                        "Are you sure you want to logout?"
                    );


                if (!confirmed) return;


                /*
                 * We don't clear the shopping data here.
                 * This means the shopping list remains
                 * available when the user logs in again.
                 */

                localStorage.removeItem(
                    "elaraLoggedIn"
                );


                showNotification(
                    "Logging out..."
                );


                setTimeout(
                    () => {

                        window.location.href =
                            "login.html";

                    },
                    800
                );

            }
        );

    }


    /* =========================================================
       WARRANTY / PRICE WATCH INTERACTION
       ========================================================= */

    function setupWarrantyAndPriceWatch() {

        document
            .querySelectorAll(".warranty-item")
            .forEach(item => {

                item.style.cursor = "pointer";

                item.addEventListener(
                    "click",
                    () => {

                        const name =
                            item.querySelector(
                                "h3"
                            )?.textContent ||
                            "Warranty";

                        const info =
                            item.querySelector(
                                "p"
                            )?.textContent ||
                            "";

                        showNotification(
                            `${name}: ${info}`
                        );

                    }
                );

            });

    }



    /* =========================================================
       PRICE WATCH  (estimated, not live retailer data)
       Built from the items on your list: typical weekly store
       specials, small week-to-week drift and each store's usual
       price level, so the numbers stay stable between reloads.
       ========================================================= */

    function renderPriceWatch() {
        const box = document.getElementById("priceWatchList");
        if (!box) return;

        const STORES = [
            { n: "Shoprite", m: 0.96 }, { n: "Checkers", m: 0.99 }, { n: "Makro", m: 0.97 },
            { n: "Pick n Pay", m: 1.01 }, { n: "Woolworths", m: 1.12 }
        ];
        const WEEKS = 8;

        const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
        const noise = key => { let t = (hash(key) + 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const shelf = p => Math.max(1, Math.round(p)) - 0.01;          // R38.99 style prices
        const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
        const weekNo = Math.floor((day + 3) / 7);                       // weeks start on Monday

        const seen = {};
        const tracked = shoppingItems.slice().reverse().filter(it => {
            const k = String(it.name || "").trim().toLowerCase();
            if (!k || seen[k] || !(Number(it.price) > 0)) return false;
            return (seen[k] = true);
        }).slice(0, 5);

        if (!tracked.length) {
            box.innerHTML = '<div class="pw-empty"><i class="fa-solid fa-tags"></i><p>Add items with a price to your list and Elara will watch them for you.</p></div>';
            return;
        }

        box.innerHTML = tracked.map((it, idx) => {
            const key = String(it.name).trim().toLowerCase();
            const base = Number(it.price);

            // regular (non-special) price per week, walking back from this week
            const regular = [base];
            for (let k = 0; k < WEEKS - 1; k++) {
                const drift = -0.014 + noise(key + "|d|" + (weekNo - k)) * 0.03;   // about -1.4% .. +1.6% a week
                regular.push(regular[k] / (1 + drift));
            }
            const promoOf = w => noise(key + "|p|" + w) < 0.15 ? 1 - (0.10 + noise(key + "|pf|" + w) * 0.15) : 1;   // ~1 week in 7 has 10-25% off
            const current = regular.map((r, k) => shelf(r * promoOf(weekNo - k)));
            const onSpecial = promoOf(weekNo) < 1;

            // today's price at each store, relative to the store the user usually shops at
            const details = String(it.details || "").toLowerCase();
            const home = STORES.find(s => details.indexOf(s.n.toLowerCase()) > -1);
            const ref = home ? home.m : 1;
            const quotes = STORES.map(s => {
                let p = regular[0] / ref * s.m * (0.985 + noise(key + "|s|" + s.n + "|" + weekNo) * 0.03);
                if (noise(key + "|sp|" + s.n + "|" + weekNo) < 0.07) p *= 0.88 + noise(key + "|spf|" + s.n + "|" + weekNo) * 0.07;
                return { n: s.n, p: shelf(p) };
            });
            const best = quotes.reduce((a, b) => (b.p < a.p ? b : a));
            const saving = base - best.p;

            const old = regular[4], change = old ? (regular[0] - old) / old * 100 : 0;   // trend ignores one-off specials
            const up = change > 0.4, down = change < -0.4;
            const trendCls = up ? "red" : down ? "green" : "";
            const trendTxt = (up ? "\u2191 " : down ? "\u2193 " : "\u2192 ") + Math.abs(change).toFixed(1) + "% in 30 days";

            let status, cls;
            if (saving >= Math.max(1, base * 0.02)) { status = "\u2193 " + formatMoney(saving) + " cheaper at " + best.n; cls = "green"; }
            else if (onSpecial) { status = "Special on now"; cls = "green"; }
            else { status = "Your price is the best"; cls = ""; }

            const pts = current.slice().reverse(), lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts);
            const line = pts.map((v, i) => (i * 62 / (pts.length - 1) + 1).toFixed(1) + "," + (hi === lo ? 12 : (22 - (v - lo) / (hi - lo) * 20)).toFixed(1)).join(" ");

            const tip = `${it.name}: cheapest ${best.n} ${formatMoney(best.p)}. 8-week range ${formatMoney(lo)} to ${formatMoney(hi)}.`;
            return `<div class="price-watch" data-tip="${escapeHTML(tip)}" role="button" tabindex="0">
                <div class="pw-left">
                    <strong>${escapeHTML(it.name)}${onSpecial ? ' <em class="pw-badge">Special</em>' : ""}</strong>
                    <small>Lowest ${escapeHTML(best.n)} ${formatMoney(best.p)} \u2022 you pay ${formatMoney(base)}</small>
                </div>
                <div class="pw-right">
                    <svg class="pw-spark ${trendCls}" viewBox="0 0 64 24" aria-hidden="true"><polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <div class="pw-delta"><span class="${cls}">${escapeHTML(status)}</span><small class="${trendCls}">${trendTxt}</small></div>
                </div>
            </div>`;
        }).join("") + '<p class="pw-note">Estimates from your listed prices and typical weekly specials. Live store prices are not connected.</p>';
    }

    document.addEventListener("click", e => {
        const row = e.target.closest("#priceWatchList .price-watch");
        if (row && row.dataset.tip) showNotification(row.dataset.tip);
    });

    /* =========================================================
       INITIALISE EVERYTHING
       ========================================================= */

    setupTheme();

    setupAddItem();

    setupItemActions();

    setupProductSearch();

    setupFilters();

    setupReceiptUpload();

    setupReceiptScanner();

    setupNotifications();

    setupGlobalSearch();

    setupLogout();

    setupWarrantyAndPriceWatch();

    renderShoppingItems();

    renderReceipts();

    renderActivities();

    updateStatistics();

    setupChart();


    /* =========================================================
       WARRANTIES (real: add, track, delete)
       ========================================================= */
    (function warrantyManager() {
        const D = window.ElaraData;
        const panel = Array.from(document.querySelectorAll(".panel")).find(p => /Warranty Reminders/i.test((p.querySelector("h2") || {}).textContent || ""));
        if (!panel) return;
        const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
        const pad = n => n < 10 ? "0" + n : "" + n;
        const key = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
        const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

        let list;
        try { list = JSON.parse(localStorage.getItem("elaraWarranties")); } catch (e) { list = null; }
        if (!Array.isArray(list)) {
            list = [];
            if (!D || D.demo) {
                const now = new Date(), day = 86400000;
                list = [
                    { id: 1, name: "Samsung Microwave", store: "Makro", purchased: key(addMonths(now, -4)), expires: key(addMonths(now, 8)) },
                    { id: 2, name: "Hisense TV", store: "Takealot", purchased: key(addMonths(now, -11)), expires: key(new Date(now.getTime() + 21 * day)) },
                    { id: 3, name: "Washing Machine", store: "Game", purchased: key(addMonths(now, -2)), expires: key(addMonths(now, 12)) }
                ];
            }
            localStorage.setItem("elaraWarranties", JSON.stringify(list));
        }
        const save = () => localStorage.setItem("elaraWarranties", JSON.stringify(list));

        function remaining(expires) {
            const days = Math.ceil((new Date(expires + "T23:59:59") - new Date()) / 86400000);
            if (days < 0) return { text: "Expired " + Math.abs(days) + " day" + (Math.abs(days) === 1 ? "" : "s") + " ago", cls: "expired" };
            if (days === 0) return { text: "Expires today", cls: "soon" };
            if (days <= 60) return { text: "Expires in " + days + " day" + (days === 1 ? "" : "s"), cls: days <= 30 ? "soon" : "" };
            const months = Math.round(days / 30.4);
            if (months >= 12) { const y = Math.round(months / 12 * 10) / 10; return { text: "Expires in " + y + " year" + (y === 1 ? "" : "s"), cls: "" }; }
            return { text: "Expires in " + months + " months", cls: "" };
        }

        // header "+ Add" button
        const header = panel.querySelector(".panel-header");
        if (!header.querySelector(".warranty-add")) {
            const b = document.createElement("button");
            b.type = "button"; b.className = "warranty-add"; b.innerHTML = '<i class="fa-solid fa-plus"></i> Add';
            header.appendChild(b);
            b.addEventListener("click", () => openForm());
        }

        function render() {
            panel.querySelectorAll(".warranty-item, .warranty-empty").forEach(n => n.remove());
            const sorted = list.slice().sort((a, b) => a.expires.localeCompare(b.expires));
            panel.insertAdjacentHTML("beforeend", sorted.length ? sorted.map(w => {
                const r = remaining(w.expires);
                return '<div class="warranty-item ' + r.cls + '" data-id="' + w.id + '"><div class="warranty-main"><h3>' + esc(w.name) + '</h3><p>' + esc(r.text) +
                       (w.store ? ' \u2022 ' + esc(w.store) : '') + '</p></div><button type="button" class="warranty-del" aria-label="Delete warranty" title="Delete"><i class="fa-solid fa-trash"></i></button></div>';
            }).join("") : '<p class="warranty-empty">No warranties saved yet. Press <strong>Add</strong> to keep track of one.</p>');
        }

        panel.addEventListener("click", e => {
            const del = e.target.closest(".warranty-del");
            if (del) {
                const item = del.closest(".warranty-item"), w = list.find(x => String(x.id) === item.dataset.id);
                if (!w) return;
                ElaraUI.confirm({ title: "Delete this warranty?", message: "\u201c" + w.name + "\u201d will no longer be tracked.", confirmText: "Delete warranty" }).then(ok => {
                    if (!ok) return;
                    list = list.filter(x => x.id !== w.id); save(); render();
                    if (D) D.log("removed warranty for " + w.name, "fa-shield"); ElaraUI.toast("Warranty removed.");
                });
                return;
            }
            const row = e.target.closest(".warranty-item");
            if (row) { const w = list.find(x => String(x.id) === row.dataset.id); if (w) openForm(w); }
        });

        function openForm(w) {
            const old = document.getElementById("warrantyModal"); if (old) old.remove();
            const today = key(new Date());
            const ov = document.createElement("div");
            ov.id = "warrantyModal"; ov.className = "eui-overlay";
            ov.innerHTML =
                '<form class="eui-box warranty-form" novalidate>' +
                    '<div class="eui-icon info"><i class="fa-solid fa-shield-halved"></i></div><h3>' + (w ? "Edit warranty" : "Add a warranty") + '</h3>' +
                    '<label>Product<input name="name" type="text" placeholder="e.g. Samsung Fridge" value="' + esc(w ? w.name : "") + '" required></label>' +
                    '<label>Store (optional)<input name="store" type="text" placeholder="e.g. Makro" value="' + esc(w ? w.store || "" : "") + '"></label>' +
                    '<div class="wf-row"><label>Purchase date<input name="purchased" type="date" value="' + (w ? w.purchased : today) + '" required></label>' +
                    '<label>Warranty (months)<input name="months" type="number" min="1" max="120" value="' + (w ? Math.max(1, Math.round((new Date(w.expires) - new Date(w.purchased)) / 2629800000)) : 12) + '" required></label></div>' +
                    '<div class="eui-actions"><button type="button" class="eui-btn ghost" data-r="0">Cancel</button><button type="submit" class="eui-btn primary">Save warranty</button></div>' +
                '</form>';
            document.body.appendChild(ov);
            requestAnimationFrame(() => ov.classList.add("show"));
            ov.querySelector('input[name="name"]').focus();
            ov.addEventListener("click", e => { if (e.target === ov || e.target.closest("[data-r]")) ov.remove(); });
            ov.querySelector("form").addEventListener("submit", e => {
                e.preventDefault();
                const f = e.target, name = f.name.value.trim(), purchased = f.purchased.value, months = parseInt(f.months.value, 10);
                if (!name || !purchased || !months) return ElaraUI.toast("Please fill in the product, date and months.", "error");
                const expires = key(addMonths(new Date(purchased + "T00:00:00"), months));
                if (w) { Object.assign(w, { name, store: f.store.value.trim(), purchased, expires }); }
                else list.push({ id: Date.now(), name, store: f.store.value.trim(), purchased, expires });
                save(); render(); ov.remove();
                if (D) D.log((w ? "updated" : "added") + " warranty for " + name, "fa-shield");
                ElaraUI.toast("Warranty saved.");
            });
        }
        render();
    })();

});