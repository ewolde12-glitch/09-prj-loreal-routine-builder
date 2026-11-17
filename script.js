// Send chat requests through the class Cloudflare Worker. Never put an API key here.
const workerUrl = "https://bitter-snow-738e.ewolde12.workers.dev/";
const savedProductsKey = "loreal-routine-selected-products";

// Keep the assistant focused on beauty guidance and avoid unsupported product claims.
const systemMessage = {
  role: "system",
  content:
    "You are a helpful L'Oréal beauty assistant. Only answer questions about L'Oréal products, skincare, makeup, haircare, fragrances, beauty routines, and product recommendations. If a question is unrelated, briefly say you can only help with L'Oréal beauty products and routines, then invite the user to ask a related question. Give clear, concise, balanced guidance. Do not invent product names, ingredients, or claims; say when you are unsure and suggest checking the product label or official L'Oréal information. For personalized recommendations, ask about relevant preferences or skin and hair needs, and avoid presenting advice as medical guidance.",
};

// Save successful user and assistant messages to give follow-up questions context.
const conversationHistory = [];
let products = [];
let selectedProductIds = new Set();
let requestInProgress = false;

// Get the elements the product and chat features update.
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const selectionStatus = document.getElementById("selectionStatus");
const storageStatus = document.getElementById("storageStatus");
const clearSelectionButton = document.getElementById("clearSelection");
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const sendButton = document.getElementById("sendBtn");

// Add chat messages as text so product data and user input are displayed safely.
function addMessage(className, text) {
  const message = document.createElement("div");
  message.className = `msg ${className}`;
  const content = document.createElement("span");
  content.dir = "auto";
  content.textContent = text;
  message.appendChild(content);
  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return message;
}

// Use a product's ID consistently for selection and saved browser data.
function getProductKey(product) {
  return String(product.id);
}

// Read the product list, then restore any saved selections.
async function loadProducts() {
  try {
    const response = await fetch("products.json");
    if (!response.ok) {
      throw new Error(`Product data could not be loaded (${response.status}).`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.products)) {
      throw new Error("The product data has an unexpected format.");
    }

    products = data.products;
    loadSavedSelections();
    renderSelectedProducts();
    renderVisibleProducts();
    updateControls();
  } catch (error) {
    console.error("Could not load products.", error);
    productsContainer.textContent =
      "Products could not be loaded. Please refresh the page and try again.";
    selectionStatus.textContent = "Product data is currently unavailable.";
  }
}

// Restore saved product IDs that still exist in products.json.
function loadSavedSelections() {
  try {
    const savedIds = JSON.parse(localStorage.getItem(savedProductsKey) || "[]");
    if (!Array.isArray(savedIds)) {
      throw new Error("Saved product selections are not a list.");
    }

    selectedProductIds = new Set(
      savedIds
        .filter((savedId) =>
          products.some((product) => getProductKey(product) === String(savedId))
        )
        .map(String)
    );
  } catch (error) {
    console.error("Could not restore saved product selections.", error);
    storageStatus.textContent =
      "Saved selections could not be restored in this browser.";
  }
}

// Save the current selection so it is still available after a page reload.
function saveSelectedProducts() {
  try {
    localStorage.setItem(
      savedProductsKey,
      JSON.stringify(Array.from(selectedProductIds))
    );
    storageStatus.textContent = "";
  } catch (error) {
    console.error("Could not save product selections.", error);
    storageStatus.textContent =
      "Your selection is available for now, but could not be saved.";
  }
}

// Display products for the selected category, including an empty-state message.
function renderVisibleProducts() {
  const selectedCategory = categoryFilter.value;
  if (!selectedCategory) {
    productsContainer.innerHTML = "";
    showProductMessage("Select a category to view products.");
    return;
  }

  const visibleProducts = products.filter(
    (product) => product.category === selectedCategory
  );
  if (visibleProducts.length === 0) {
    productsContainer.innerHTML = "";
    showProductMessage("No products are available in this category.");
    return;
  }

  productsContainer.innerHTML = "";
  visibleProducts.forEach((product) => {
    const productKey = getProductKey(product);
    const isSelected = selectedProductIds.has(productKey);
    const entry = document.createElement("article");
    entry.className = "product-entry";

    const card = document.createElement("button");
    card.type = "button";
    card.className = "product-card";
    card.dataset.productId = productKey;
    card.setAttribute("aria-label", `${product.name} by ${product.brand}`);
    card.setAttribute("aria-pressed", String(isSelected));

    const image = document.createElement("img");
    image.src = product.image;
    image.alt = "";
    card.appendChild(image);

    const info = document.createElement("span");
    info.className = "product-info";

    const name = document.createElement("span");
    name.className = "product-name";
    name.textContent = product.name;

    const brand = document.createElement("span");
    brand.className = "product-brand";
    brand.textContent = product.brand;

    const indicator = document.createElement("span");
    indicator.className = "selection-indicator";
    indicator.setAttribute("aria-hidden", "true");
    indicator.textContent = isSelected ? "Selected" : "Select";

    info.append(name, brand, indicator);
    card.appendChild(info);
    card.addEventListener("click", () => toggleProductSelection(product));
    entry.appendChild(card);

    const descriptionId = `product-description-${productKey}`;
    const descriptionButton = document.createElement("button");
    descriptionButton.type = "button";
    descriptionButton.className = "description-toggle";
    descriptionButton.setAttribute("aria-expanded", "false");
    descriptionButton.setAttribute("aria-controls", descriptionId);
    descriptionButton.textContent = "View description";

    const description = document.createElement("p");
    description.id = descriptionId;
    description.className = "product-description";
    description.hidden = true;
    description.textContent = product.description || "No description available.";

    descriptionButton.addEventListener("click", () => {
      const isExpanded =
        descriptionButton.getAttribute("aria-expanded") === "true";
      descriptionButton.setAttribute("aria-expanded", String(!isExpanded));
      descriptionButton.textContent = isExpanded
        ? "View description"
        : "Hide description";
      description.hidden = isExpanded;
    });

    entry.append(descriptionButton, description);
    productsContainer.appendChild(entry);
  });
}

// Show a helpful message when products cannot be displayed.
function showProductMessage(text) {
  const message = document.createElement("p");
  message.className = "placeholder-message";
  message.textContent = text;
  productsContainer.appendChild(message);
}

// Update a product card's pressed state without closing its description.
function updateProductCardStates() {
  document.querySelectorAll(".product-card").forEach((card) => {
    const isSelected = selectedProductIds.has(card.dataset.productId);
    card.setAttribute("aria-pressed", String(isSelected));

    const indicator = card.querySelector(".selection-indicator");
    indicator.textContent = isSelected ? "Selected" : "Select";
  });
}

// Add or remove one product, then update the saved list and visible controls.
function toggleProductSelection(product) {
  const productKey = getProductKey(product);
  if (selectedProductIds.has(productKey)) {
    selectedProductIds.delete(productKey);
  } else {
    selectedProductIds.add(productKey);
  }

  saveSelectedProducts();
  updateProductCardStates();
  renderSelectedProducts();
  updateControls();
}

// Keep the selected-products list in sync and provide a remove button per item.
function renderSelectedProducts() {
  selectedProductsList.innerHTML = "";
  const selectedProducts = products.filter((product) =>
    selectedProductIds.has(getProductKey(product))
  );

  selectedProducts.forEach((product) => {
    const item = document.createElement("div");
    item.className = "selected-product-item";

    const productName = document.createElement("span");
    productName.className = "selected-product-name";
    productName.textContent = product.name;

    const productBrand = document.createElement("span");
    productBrand.className = "selected-product-brand";
    productBrand.textContent = product.brand;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-product-btn";
    removeButton.setAttribute(
      "aria-label",
      `Remove ${product.name} from selected products`
    );
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () =>
      toggleProductSelection(product)
    );

    item.append(productName, productBrand, removeButton);
    selectedProductsList.appendChild(item);
  });

  const count = selectedProducts.length;
  selectionStatus.textContent =
    count === 1 ? "1 product selected." : `${count} products selected.`;
}

// Keep buttons enabled only when their action is currently available.
function updateControls() {
  const hasSelection = selectedProductIds.size > 0;
  generateRoutineButton.disabled = requestInProgress || !hasSelection;
  sendButton.disabled = requestInProgress;
  userInput.disabled = requestInProgress;
  clearSelectionButton.disabled = !hasSelection;
}

// Send the full successful conversation to the Worker and validate its reply.
async function getAssistantReply(message) {
  if (workerUrl.includes("your-subdomain")) {
    throw new Error(
      "Add your class Cloudflare Worker URL near the top of script.js, then try again."
    );
  }

  const response = await fetch(workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        systemMessage,
        ...conversationHistory,
        { role: "user", content: message },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok || (data && data.error)) {
    let errorMessage = "";
    if (data && data.error) {
      errorMessage =
        typeof data.error === "string" ? data.error : data.error.message;
    }
    throw new Error(errorMessage || `The request failed (${response.status}).`);
  }

  const reply =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;
  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error("The service returned an empty reply.");
  }

  return reply;
}

// Handle both routine requests and follow-up questions in the same conversation.
async function askAssistant(message, displayedMessage) {
  if (requestInProgress) {
    return;
  }

  requestInProgress = true;
  updateControls();
  addMessage("user", displayedMessage);
  const thinkingMessage = addMessage("ai", "Thinking…");

  try {
    const reply = await getAssistantReply(message);
    thinkingMessage.textContent = reply;
    conversationHistory.push(
      { role: "user", content: message },
      { role: "assistant", content: reply }
    );
    chatWindow.scrollTop = chatWindow.scrollHeight;
  } catch (error) {
    thinkingMessage.remove();
    addMessage("ai error", `Sorry, I couldn't get a reply. ${error.message}`);
  } finally {
    requestInProgress = false;
    updateControls();
    userInput.focus();
  }
}

// Show a greeting when the chat first opens.
addMessage("ai", "👋 Hello! How can I help you today?");

// Load the product catalog and restore any previous product selections.
loadProducts();

// Refresh the product cards when the category changes.
categoryFilter.addEventListener("change", renderVisibleProducts);

// Remove all selected products from the page and saved browser data.
clearSelectionButton.addEventListener("click", () => {
  selectedProductIds.clear();
  saveSelectedProducts();
  updateProductCardStates();
  renderSelectedProducts();
  updateControls();
});

// Ask the Worker to build a routine using only products the user selected.
generateRoutineButton.addEventListener("click", () => {
  const selectedProducts = products
    .filter((product) => selectedProductIds.has(getProductKey(product)))
    .map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
    }));

  if (selectedProducts.length === 0) {
    return;
  }

  const productData = JSON.stringify(selectedProducts, null, 2);
  const request =
    "Create a personalized routine using only these selected products. Explain the order and how to use each product. Do not add products that are not in the supplied data. If timing or compatibility is uncertain, say so and recommend checking product labels.\n\nSelected product data:\n" +
    productData;
  const productNames = selectedProducts
    .map((product) => `${product.brand} ${product.name}`)
    .join(", ");

  askAssistant(
    request,
    `Please create a routine using my selected products: ${productNames}`
  );
});

// Send follow-up questions and keep the input available after each response.
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const message = userInput.value.trim();
  if (!message) {
    userInput.setCustomValidity("Please enter a message.");
    userInput.reportValidity();
    return;
  }

  userInput.setCustomValidity("");
  userInput.value = "";
  askAssistant(message, message);
});

// Clear the empty-message warning as soon as the user starts typing.
userInput.addEventListener("input", () => {
  userInput.setCustomValidity("");
});
