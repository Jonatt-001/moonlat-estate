import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";

import {
  getFirestore,
  collection,
  query,
  where,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDxtSNaTqeTvUKD_tahO5LuR238AqZfpqg",
  authDomain: "moonlat-estate-dashboard.firebaseapp.com",
  projectId: "moonlat-estate-dashboard",
  storageBucket: "moonlat-estate-dashboard.firebasestorage.app",
  messagingSenderId: "289878951289",
  appId: "1:289878951289:web:18db63e3ab8f071b811ba8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const API_BASE = "/api/live-market";

const els = {
  q: document.querySelector("#q"),
  purposeTabs: [...document.querySelectorAll(".purpose-tab")],
  type: document.querySelector("#type"),
  typeLabel: document.querySelector("#typeLabel"),
  beds: document.querySelector("#beds"),
  bedsLabel: document.querySelector("#bedsLabel"),
  price: document.querySelector("#price"),
  priceLabel: document.querySelector("#priceLabel"),
  sort: document.querySelector("#sort"),
  searchBtn: document.querySelector("#searchBtn"),
  grid: document.querySelector("#grid"),
  loading: document.querySelector("#loading"),
  empty: document.querySelector("#empty"),
  error: document.querySelector("#error"),
  resultCount: document.querySelector("#resultCount"),
  statListings: document.querySelector("#statListings"),
  statMoonlat: document.querySelector("#statMoonlat"),
  statExternal: document.querySelector("#statExternal"),
  statStatus: document.querySelector("#statStatus"),
  syncStatus: document.querySelector("#syncStatus"),
  syncTime: document.querySelector("#syncTime"),
  statusRing: document.querySelector("#statusRing"),
  overviewSourceText: document.querySelector("#overviewSourceText"),
  template: document.querySelector("#propertyTemplate"),
  clearFilters: document.querySelector("#clearFilters"),
  menuButton: document.querySelector("#menuButton"),
  mobileNav: document.querySelector("#mobileNav")
};

let selectedPurpose = "";
let moonlatProperties = [];
let externalProperties = [];
let allProperties = [];
let externalLoaded = false;
let moonlatLoaded = false;
let externalError = null;
let debounceTimer = null;

document.querySelector("#year").textContent = new Date().getFullYear();

function getTimestampValue(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function relativeTime(value) {
  const timestamp = getTimestampValue(value);
  if (!timestamp) return "Recently updated";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 2) return "Just updated";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatPrice(property) {
  const price = Number(property.price);
  if (!Number.isFinite(price) || price <= 0) return "Contact for price";
  const currency = property.currency || "NGN";
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString()}`;
  }
}

function normalizeInternalProperty(property) {
  const type = property.type || property.propertyType || "Property";
  const purpose = String(
    property.transactionType ||
    property.listingType ||
    property.purpose ||
    property.status ||
    ""
  ).toLowerCase();

  let transaction = "";
  if (type.toLowerCase() === "shortlet") transaction = "rent";
  else if (purpose.includes("rent")) transaction = "rent";
  else if (purpose.includes("lease")) transaction = "lease";
  else if (purpose.includes("sale") || purpose.includes("active")) transaction = "sale";

  const image =
    property.image ||
    property.coverImage ||
    property.mainImage ||
    property.imageUrl ||
    (Array.isArray(property.images) ? property.images[0] : "") ||
    (Array.isArray(property.gallery) ? property.gallery[0] : "");

  return {
    id: `moonlat:${property.id}`,
    internalId: property.id,
    sourceType: "internal",
    sourceName: "MoonLat",
    title: property.title || property.name || "MoonLat property",
    price: property.price ?? null,
    currency: property.currency || "NGN",
    propertyType: type,
    transaction,
    bedrooms: property.beds ?? property.bedrooms ?? null,
    bathrooms: property.baths ?? property.bathrooms ?? null,
    area: property.areaName || property.areaLocation || property.area || "",
    city: property.city || "",
    state: property.state || "",
    location: property.location || "",
    image,
    sourceUrl: `../property-detail.html?id=${encodeURIComponent(property.id)}`,
    updatedAt: property.updatedAt || property.createdAt || null,
    createdAt: property.createdAt || null,
    status: property.status || ""
  };
}

function normalizeExternalProperty(item) {
  const location = item.location || {};
  const originalCurrency = item.original_currency || item.currency || "NGN";
  return {
    id: `external:${item.id}`,
    sourceType: "external",
    sourceName: item.source_name || item.source || "External source",
    title: item.title || "External property listing",
    price: item.price_original ?? item.price ?? null,
    currency: originalCurrency,
    priceUsd: item.price_usd ?? null,
    propertyType: normalizeExternalType(item.type),
    transaction: normalizeTransaction(item.transaction),
    bedrooms: item.beds ?? item.bedrooms ?? null,
    bathrooms: item.baths ?? item.bathrooms ?? null,
    area: location.area || location.district || item.area || "",
    city: location.city || item.city || "",
    state: location.state || item.state || "",
    locationText: location.name || "",
    image: item.image || item.image_url || (Array.isArray(item.images) ? item.images[0] : ""),
    sourceUrl: item.original_url || item.url || "",
    updatedAt: item.updated_at || item.updatedAt || item.created_at || null,
    createdAt: item.created_at || null
  };
}

function normalizeExternalType(value) {
  const v = String(value || "").toLowerCase();
  if (v.includes("flat") || v.includes("apartment")) return "Apartment";
  if (v.includes("villa")) return "Villa";
  if (v.includes("house") || v.includes("duplex") || v.includes("terrace")) return "House";
  if (v.includes("land") || v.includes("plot")) return "Land";
  if (v.includes("commercial") || v.includes("office") || v.includes("shop")) return "Commercial";
  if (v.includes("shortlet")) return "Shortlet";
  return value || "Property";
}

function normalizeTransaction(value) {
  const v = String(value || "").toLowerCase();
  if (v.includes("rent")) return "rent";
  if (v.includes("lease")) return "lease";
  if (v.includes("sale") || v.includes("buy")) return "sale";
  return "";
}

function getSearchText(property) {
  return [
    property.title,
    property.location,
    property.locationText,
    property.area,
    property.city,
    property.state,
    property.propertyType
  ].filter(Boolean).join(" ").toLowerCase();
}

function updateLabels() {
  els.typeLabel.textContent = els.type.options[els.type.selectedIndex]?.text || "Any type";
  els.bedsLabel.textContent = els.beds.options[els.beds.selectedIndex]?.text || "Any";
  els.priceLabel.textContent = els.price.options[els.price.selectedIndex]?.text || "Any range";
}

function matchesFilters(property) {
  const search = els.q.value.trim().toLowerCase();

  if (search && !getSearchText(property).includes(search)) return false;

  if (selectedPurpose && property.transaction !== selectedPurpose) return false;

  if (els.type.value && String(property.propertyType).toLowerCase() !== els.type.value.toLowerCase()) return false;

  if (els.beds.value) {
    const bedrooms = Number(property.bedrooms || 0);
    if (bedrooms < Number(els.beds.value)) return false;
  }

  if (els.price.value) {
    const [min, max] = els.price.value.split("-");
    const price = Number(property.price);
    if (!Number.isFinite(price)) return false;
    if (min && price < Number(min)) return false;
    if (max && price > Number(max)) return false;
  }

  return true;
}

function sortProperties(properties) {
  const sorted = [...properties];

  if (els.sort.value === "price-low") {
    sorted.sort((a, b) => Number(a.price || Infinity) - Number(b.price || Infinity));
  } else if (els.sort.value === "price-high") {
    sorted.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  } else {
    sorted.sort((a, b) => getTimestampValue(b.createdAt || b.updatedAt) - getTimestampValue(a.createdAt || a.updatedAt));
  }

  return sorted;
}

function dedupeProperties(properties) {
  const seen = new Set();
  return properties.filter(property => {
    const canonical = [
      property.sourceUrl,
      property.title,
      property.price,
      property.city,
      property.area
    ].filter(Boolean).join("|").toLowerCase();

    const key = property.sourceType === "internal"
      ? property.id
      : canonical || property.id;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rebuildMarket() {
  allProperties = dedupeProperties([...moonlatProperties, ...externalProperties]);
  const filtered = sortProperties(allProperties.filter(matchesFilters));

  renderProperties(filtered);
  updateStats(filtered);
}

function updateStats(filtered) {
  const moonlatCount = filtered.filter(p => p.sourceType === "internal").length;
  const externalCount = filtered.filter(p => p.sourceType === "external").length;

  els.statListings.textContent = filtered.length.toLocaleString();
  els.statMoonlat.textContent = moonlatCount.toLocaleString();
  els.statExternal.textContent = externalCount.toLocaleString();
  els.resultCount.textContent = `${filtered.length.toLocaleString()} ${filtered.length === 1 ? "property" : "properties"}`;

  const internalReady = moonlatLoaded;
  const externalReady = externalLoaded || Boolean(externalError);

  if (internalReady && externalReady) {
    if (externalError && moonlatProperties.length) {
      els.statStatus.textContent = "Partial";
      els.syncStatus.textContent = "Partially live";
      els.overviewSourceText.textContent = "MoonLat + external feed";
      els.statusRing.classList.add("offline");
    } else {
      els.statStatus.textContent = "Live";
      els.syncStatus.textContent = "Live";
      els.overviewSourceText.textContent = "Live + MoonLat";
      els.statusRing.classList.remove("offline");
    }
    els.syncTime.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
}

function renderProperties(properties) {
  els.grid.innerHTML = "";
  els.empty.hidden = Boolean(properties.length);

  if (!properties.length) return;

  properties.forEach(property => {
    const node = els.template.content.cloneNode(true);
    const media = node.querySelector(".property-media");
    const image = node.querySelector(".property-image");
    const badge = node.querySelector(".source-badge");
    const badgeDot = node.querySelector(".source-badge span");
    const badgeText = node.querySelector(".source-badge em");
    const freshBadge = node.querySelector(".fresh-badge");
    const saveButton = node.querySelector(".save-button");
    const price = node.querySelector(".price");
    const purpose = node.querySelector(".purpose");
    const title = node.querySelector(".title");
    const location = node.querySelector(".location");
    const facts = node.querySelector(".facts");
    const source = node.querySelector(".source");
    const viewLink = node.querySelector(".view-link");

    const href = property.sourceType === "internal"
      ? `../property-detail.html?id=${encodeURIComponent(property.internalId)}`
      : property.sourceUrl || "#";

    media.href = href;
    viewLink.href = href;

    if (property.sourceType === "external") {
      viewLink.textContent = "View source ";
      const arrow = document.createElement("span");
      arrow.textContent = "↗";
      viewLink.appendChild(arrow);
    } else {
      viewLink.textContent = "View on MoonLat ";
      const arrow = document.createElement("span");
      arrow.textContent = "→";
      viewLink.appendChild(arrow);
    }

    image.src = property.image || "./placeholder.svg";
    image.alt = property.title || "Property listing";
    image.onerror = () => {
      image.src = "./placeholder.svg";
    };

    badge.classList.toggle("internal", property.sourceType === "internal");
    badgeDot.style.background = property.sourceType === "internal" ? "var(--accent)" : "";
    badgeText.textContent = property.sourceType === "internal" ? "MoonLat verified" : `${property.sourceName} · aggregated`;

    price.textContent = formatPrice(property);
    purpose.textContent =
      property.transaction === "rent" ? "For rent" :
      property.transaction === "lease" ? "Lease" :
      property.transaction === "sale" ? "For sale" :
      "Listing";

    title.textContent = property.title || "Property listing";

    const locationParts = [
      property.area,
      property.city,
      property.state
    ].filter(Boolean);

    location.textContent = locationParts.join(", ") || property.locationText || "Nigeria";
    freshBadge.textContent = relativeTime(property.updatedAt || property.createdAt);

    source.textContent = property.sourceType === "internal"
      ? "MoonLat inventory"
      : `Source: ${property.sourceName || "External"}`;

    const facts = [
      property.bedrooms != null && property.bedrooms !== "" ? `${property.bedrooms} beds` : "",
      property.bathrooms != null && property.bathrooms !== "" ? `${property.bathrooms} baths` : "",
      property.propertyType || ""
    ].filter(Boolean);

    node.querySelector(".facts").innerHTML = facts
      .map(value => `<span>${escapeHtml(value)}</span>`)
      .join("");

    const saveKey = `moonlat:live-market:saved:${property.id}`;
    if (localStorage.getItem(saveKey) === "1") saveButton.classList.add("saved");

    saveButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const saved = saveButton.classList.toggle("saved");
      localStorage.setItem(saveKey, saved ? "1" : "0");
    });

    els.grid.appendChild(node);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadExternalMarket() {
  try {
    const response = await fetch(`${API_BASE}/listings?country=NG&page=1&pageSize=24&sort=newest`, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    const payload = await response.json();

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "External market feed unavailable.");
    }

    externalProperties = Array.isArray(payload.data)
      ? payload.data.map(normalizeExternalProperty)
      : [];

    externalLoaded = true;
    externalError = null;
    rebuildMarket();
  } catch (error) {
    externalLoaded = false;
    externalError = error;
    externalProperties = [];
    rebuildMarket();

    if (!moonlatProperties.length) {
      showError(error.message || "The external market feed is temporarily unavailable.");
    }
  }
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = false;
}

function clearError() {
  els.error.hidden = true;
  els.error.textContent = "";
}

function loadMoonlatMarket() {
  const allQuery = query(
    collection(db, "properties"),
    where("status", "in", ["Active", "Rented"]),
    limit(200)
  );

  onSnapshot(
    allQuery,
    snapshot => {
      moonlatProperties = snapshot.docs.map(docSnapshot => ({
        id: docSnapshot.id,
        ...docSnapshot.data()
      })).map(normalizeInternalProperty);

      moonlatLoaded = true;
      clearError();
      rebuildMarket();
    },
    error => {
      moonlatLoaded = true;
      moonlatProperties = [];
      showError("MoonLat property inventory could not be loaded. Check the Firestore connection or rules.");
      rebuildMarket();
      console.error("MoonLat live market Firestore error:", error);
    }
  );
}

function clearFilters() {
  els.q.value = "";
  selectedPurpose = "";
  els.type.value = "";
  els.beds.value = "";
  els.price.value = "";
  els.sort.value = "newest";

  els.purposeTabs.forEach(tab => {
    tab.classList.toggle("active", tab.dataset.purpose === "");
  });

  updateLabels();
  clearError();
  rebuildMarket();
}

els.purposeTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    selectedPurpose = tab.dataset.purpose || "";
    els.purposeTabs.forEach(item => item.classList.toggle("active", item === tab));
    rebuildMarket();
  });
});

[els.type, els.beds, els.price, els.sort].forEach(control => {
  control.addEventListener("change", () => {
    updateLabels();
    rebuildMarket();
  });
});

els.searchBtn.addEventListener("click", () => {
  clearError();
  rebuildMarket();
  loadExternalMarket();
});

els.q.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    clearError();
    rebuildMarket();
    loadExternalMarket();
  }
});

els.q.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => rebuildMarket(), 180);
});

document.querySelectorAll(".quick-links button").forEach(button => {
  button.addEventListener("click", () => {
    els.q.value = button.dataset.query || "";
    clearError();
    rebuildMarket();
    loadExternalMarket();
  });
});

els.clearFilters.addEventListener("click", clearFilters);

els.menuButton.addEventListener("click", () => {
  const isOpen = els.menuButton.getAttribute("aria-expanded") === "true";
  els.menuButton.setAttribute("aria-expanded", String(!isOpen));
  els.mobileNav.hidden = isOpen;
});

els.mobileNav.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => {
    els.menuButton.setAttribute("aria-expanded", "false");
    els.mobileNav.hidden = true;
  });
});

updateLabels();
loadMoonlatMarket();
loadExternalMarket();

setInterval(() => {
  if (document.visibilityState === "visible") {
    loadExternalMarket();
  }
}, 300000);
