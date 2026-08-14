

/* ============================================================
   FIREBASE
============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  increment,
  runTransaction
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
const auth = getAuth(app);
const db = getFirestore(app);


/* ============================================================
   CLOUDINARY
============================================================ */

const CLOUDINARY_CLOUD_NAME = "dxdbn6xwy";
const CLOUDINARY_UPLOAD_PRESET = "geefox_unsigned";
const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;


/* ============================================================
   STATE
============================================================ */

let currentUser = null;
let currentProfile = null;

let allPosts = [];
let filteredPosts = [];

let properties = [];

let activeCategory = "all";
let activeSort = "latest";
let searchTerm = "";
let nearbyMode = false;

let selectedPostType = "discussion";
let selectedImages = [];
let currentCommentsPostId = null;
let currentReportPostId = null;

let feedUnsubscribe = null;
let commentsUnsubscribe = null;
let notificationUnsubscribe = null;

let userLocation = null;


/* ============================================================
   DOM
============================================================ */

const $ = (id) => document.getElementById(id);


/* ============================================================
   UTILITIES
============================================================ */

function escapeHTML(value = "") {

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function getInitials(name = "") {

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "U";

  return parts
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join("")
    .toUpperCase();
}


function displayName() {

  return (
    currentProfile?.displayName ||
    currentProfile?.name ||
    currentUser?.displayName ||
    currentUser?.email?.split("@")[0] ||
    "User"
  );
}


function displayRole() {

  const role =
    currentProfile?.role ||
    currentUser?.role ||
    "client";

  return String(role).toLowerCase();
}


function avatarURL(profile = {}) {

  return (
    profile.photoURL ||
    profile.photoUrl ||
    profile.avatar ||
    profile.profileImage ||
    profile.image ||
    ""
  );
}


function formatRelativeTime(timestamp) {

  if (!timestamp) return "Just now";

  const date =
    typeof timestamp?.toDate === "function"
      ? timestamp.toDate()
      : timestamp instanceof Date
        ? timestamp
        : new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "Recently";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== new Date().getFullYear()
      ? "numeric"
      : undefined
  });
}


function formatNumber(number = 0) {

  const value = Number(number) || 0;

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }

  return String(value);
}


function getPostTypeLabel(type) {

  const labels = {
    discussion: "Discussion",
    question: "Question",
    property: "Property",
    photo: "Local Photo",
    market: "Market",
    investment: "Investment",
    advice: "Advice"
  };

  return labels[type] || "Community";
}


function getPostTypeIcon(type) {

  const icons = {
    discussion: "fa-message",
    question: "fa-circle-question",
    property: "fa-building",
    photo: "fa-camera",
    market: "fa-chart-line",
    investment: "fa-chart-pie",
    advice: "fa-lightbulb"
  };

  return icons[type] || "fa-message";
}


function toast(message, type = "success") {

  const stack = $("toastStack");

  const item = document.createElement("div");

  item.className = `toast ${type}`;

  const icon =
    type === "success"
      ? "fa-check"
      : type === "error"
        ? "fa-exclamation"
        : "fa-info";

  item.innerHTML = `
    <div class="toast-icon">
      <i class="fas ${icon} text-[9px]"></i>
    </div>

    <div class="toast-message">${escapeHTML(message)}</div>

    <button class="toast-close" type="button" aria-label="Close notification">
      <i class="fas fa-xmark text-[10px]"></i>
    </button>
  `;

  stack.appendChild(item);

  const remove = () => {
    item.style.opacity = "0";
    item.style.transform = "translateY(5px)";
    setTimeout(() => item.remove(), 180);
  };

  item.querySelector(".toast-close").addEventListener("click", remove);

  setTimeout(remove, 4000);
}


function setButtonLoading(button, loading, label = "Please wait") {

  if (!button) return;

  if (loading) {

    button.dataset.originalLabel = button.innerHTML;

    button.disabled = true;

    button.innerHTML = `
      <i class="fas fa-spinner fa-spin mr-1"></i>
      ${escapeHTML(label)}
    `;

  } else {

    button.disabled = false;

    if (button.dataset.originalLabel) {
      button.innerHTML = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  }
}


function isOnline() {
  return navigator.onLine;
}


/* ============================================================
   NETWORK
============================================================ */

function updateNetworkState() {

  $("networkBanner").classList.toggle("show", !navigator.onLine);
}

window.addEventListener("online", updateNetworkState);
window.addEventListener("offline", updateNetworkState);

updateNetworkState();


/* ============================================================
   PROFILE
============================================================ */

async function loadCurrentProfile(user) {

  try {

    const snap = await getDoc(doc(db, "users", user.uid));

    if (snap.exists()) {

      currentProfile = {
        id: snap.id,
        ...snap.data()
      };

    } else {

      currentProfile = {
        id: user.uid,
        displayName: user.displayName || user.email?.split("@")[0] || "User",
        role: "client",
        photoURL: user.photoURL || ""
      };
    }

  } catch (error) {

    console.error("Profile load error:", error);

    currentProfile = {
      id: user.uid,
      displayName: user.displayName || user.email?.split("@")[0] || "User",
      role: "client",
      photoURL: user.photoURL || ""
    };
  }

  updateIdentityUI();
}


function updateIdentityUI() {

  const name = displayName();
  const role = displayRole();
  const avatar = avatarURL(currentProfile);

  const avatarTargets = [
    $("composerAvatar"),
    $("modalAuthorAvatar")
  ];

  avatarTargets.forEach(element => {

    if (!element) return;

    if (avatar) {

      element.innerHTML = `
        <img
          src="${escapeHTML(avatar)}"
          alt="${escapeHTML(name)}"
          loading="lazy"
        >
      `;

    } else {

      element.textContent = getInitials(name);
    }
  });


  const headerAvatar = $("headerAvatar");

  if (headerAvatar) {

    if (avatar) {

      headerAvatar.innerHTML = `
        <img
          src="${escapeHTML(avatar)}"
          alt="${escapeHTML(name)}"
        >
      `;

    } else {

      headerAvatar.textContent = getInitials(name);
    }
  }


  $("modalAuthorName").textContent = name;

  $("modalAuthorRole").textContent =
    role === "agent"
      ? "Verified agent"
      : role === "admin"
        ? "Administrator"
        : "Community member";
}


/* ============================================================
   PROPERTIES
============================================================ */

async function loadProperties() {

  if (!currentUser) return;

  try {

    const q = query(
      collection(db, "properties"),
      where("ownerId", "==", currentUser.uid),
      limit(100)
    );

    const snap = await getDocs(q);

    properties = snap.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    populatePropertySelector();

  } catch (error) {

    console.error("Property load error:", error);

    properties = [];
  }
}


function populatePropertySelector() {

  const select = $("propertySelect");

  select.innerHTML = `
    <option value="">Choose one of your properties</option>
  `;

  properties.forEach(property => {

    const option = document.createElement("option");

    option.value = property.id;

    option.textContent =
      property.title ||
      property.name ||
      property.address ||
      "Untitled property";

    select.appendChild(option);
  });
}


function getSelectedProperty() {

  const id = $("propertySelect").value;

  if (!id) return null;

  return properties.find(property => property.id === id) || null;
}


/* ============================================================
   CLOUDINARY
============================================================ */

function validateImage(file) {

  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!allowed.includes(file.type)) {
    throw new Error(`${file.name}: unsupported image format.`);
  }

  const maxSize = 10 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error(`${file.name}: image must be 10MB or smaller.`);
  }
}


async function uploadImage(file, onProgress) {

  validateImage(file);

  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "moonlat_community");

  return new Promise((resolve, reject) => {

    const xhr = new XMLHttpRequest();

    xhr.open("POST", CLOUDINARY_UPLOAD_URL, true);

    xhr.upload.addEventListener("progress", event => {

      if (!event.lengthComputable || !onProgress) return;

      onProgress(
        Math.round((event.loaded / event.total) * 100)
      );
    });

    xhr.addEventListener("load", () => {

      if (xhr.status >= 200 && xhr.status < 300) {

        try {

          const response = JSON.parse(xhr.responseText);

          resolve(response);

        } catch {

          reject(new Error("Invalid upload response."));
        }

      } else {

        let message = "Image upload failed.";

        try {

          const response = JSON.parse(xhr.responseText);

          if (response?.error?.message) {
            message = response.error.message;
          }

        } catch {}

        reject(new Error(message));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error while uploading image."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Image upload was cancelled."));
    });

    xhr.send(formData);
  });
}


/* ============================================================
   IMAGE SELECTION
============================================================ */

function renderImagePreviews() {

  const grid = $("imagePreviewGrid");

  grid.innerHTML = "";

  if (!selectedImages.length) {

    grid.classList.add("hidden");

    return;
  }

  grid.classList.remove("hidden");

  selectedImages.forEach((item, index) => {

    const wrapper = document.createElement("div");

    wrapper.className = "preview-item";

    const image = document.createElement("img");

    image.src = item.preview;

    image.alt = item.file.name;

    image.loading = "lazy";

    const remove = document.createElement("button");

    remove.type = "button";

    remove.className = "preview-remove";

    remove.innerHTML = `
      <i class="fas fa-xmark text-[9px]"></i>
    `;

    remove.addEventListener("click", () => {

      URL.revokeObjectURL(item.preview);

      selectedImages.splice(index, 1);

      renderImagePreviews();
    });

    wrapper.appendChild(image);
    wrapper.appendChild(remove);

    grid.appendChild(wrapper);
  });
}


function handleImageSelection(files) {

  const incoming = Array.from(files || []);

  if (!incoming.length) return;

  if (selectedImages.length + incoming.length > 8) {

    toast("You can attach up to 8 images per post.", "error");

    return;
  }

  try {

    incoming.forEach(file => {

      validateImage(file);

      selectedImages.push({
        file,
        preview: URL.createObjectURL(file)
      });
    });

    renderImagePreviews();

  } catch (error) {

    toast(error.message, "error");
  }
}


/* ============================================================
   GEOLOCATION
============================================================ */

async function reverseGeocode(latitude, longitude) {

  try {

    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("Location lookup failed.");
    }

    const data = await response.json();

    return data.display_name || null;

  } catch (error) {

    console.warn("Reverse geocoding unavailable:", error);

    return null;
  }
}


async function requestLiveLocation() {

  if (!navigator.geolocation) {

    throw new Error(
      "Location services are not supported by this browser."
    );
  }

  return new Promise((resolve, reject) => {

    navigator.geolocation.getCurrentPosition(

      async position => {

        const latitude = Number(
          position.coords.latitude.toFixed(6)
        );

        const longitude = Number(
          position.coords.longitude.toFixed(6)
        );

        const accuracy = Math.round(
          position.coords.accuracy || 0
        );

        const label =
          await reverseGeocode(latitude, longitude);

        const location = {
          latitude,
          longitude,
          accuracy,
          label: label || `${latitude}, ${longitude}`,
          capturedAt: new Date().toISOString()
        };

        userLocation = location;

        resolve(location);
      },

      error => {

        let message = "Unable to determine your location.";

        if (error.code === error.PERMISSION_DENIED) {
          message = "Location permission was denied.";
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          message = "Your location is currently unavailable.";
        }

        if (error.code === error.TIMEOUT) {
          message = "Location request timed out.";
        }

        reject(new Error(message));
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
      }
    );
  });
}


async function handleLocationToggle() {

  const checked = $("attachLocation").checked;

  if (!checked) {

    userLocation = null;

    $("locationStatus").textContent =
      "Your location will only be requested when you enable this.";

    return;
  }

  $("locationStatus").textContent =
    "Requesting your current location...";

  try {

    const location = await requestLiveLocation();

    $("locationStatus").textContent =
      `${location.label} · ±${location.accuracy}m`;

  } catch (error) {

    $("attachLocation").checked = false;

    $("locationStatus").textContent =
      "Location could not be attached.";

    toast(error.message, "error");
  }
}


/* ============================================================
   POST MODAL
============================================================ */

function openComposer(type = "discussion") {

  selectedPostType = type;

  document.querySelectorAll(".post-type-option").forEach(button => {

    button.classList.toggle(
      "active",
      button.dataset.postType === type
    );
  });

  updateComposerFields();

  $("composerModal").classList.add("open");

  document.body.classList.add("modal-open");

  setTimeout(() => {

    if (type === "question" || type === "discussion") {
      $("postTitle").focus();
    } else {
      $("postContent").focus();
    }

  }, 80);
}


function closeComposer() {

  $("composerModal").classList.remove("open");

  document.body.classList.remove("modal-open");
}


function resetComposer() {

  $("postForm").reset();

  $("postTitle").value = "";
  $("postContent").value = "";

  $("characterCount").textContent = "0 / 5000";

  selectedImages.forEach(item => {
    URL.revokeObjectURL(item.preview);
  });

  selectedImages = [];

  renderImagePreviews();

  userLocation = null;

  $("locationStatus").textContent =
    "Your location will only be requested when you enable this.";

  selectedPostType = "discussion";

  document.querySelectorAll(".post-type-option").forEach(button => {

    button.classList.toggle(
      "active",
      button.dataset.postType === "discussion"
    );
  });

  updateComposerFields();
}


function updateComposerFields() {

  const titleRequired =
    selectedPostType === "discussion" ||
    selectedPostType === "question" ||
    selectedPostType === "property";

  $("titleField").classList.toggle(
    "hidden",
    !titleRequired
  );

  $("postTitle").required = titleRequired;

  $("propertyField").classList.toggle(
    "show",
    selectedPostType === "property"
  );

  if (selectedPostType === "property") {

    if (!properties.length) {

      $("propertyField").querySelector("select").innerHTML = `
        <option value="">You have no properties available</option>
      `;

    } else {

      populatePropertySelector();
    }
  }
}


/* ============================================================
   CREATE POST
============================================================ */

async function createPost(event) {

  event.preventDefault();

  if (!currentUser) {

    toast("Your session is no longer active.", "error");

    return;
  }

  if (!isOnline()) {

    toast("You are offline. Please reconnect before publishing.", "error");

    return;
  }

  const content = $("postContent").value.trim();
  const title = $("postTitle").value.trim();

  if (!content) {

    toast("Write something before publishing.", "error");

    $("postContent").focus();

    return;
  }

  if (
    (selectedPostType === "discussion" ||
      selectedPostType === "question" ||
      selectedPostType === "property") &&
    !title
  ) {

    toast("Add a title to your post.", "error");

    $("postTitle").focus();

    return;
  }

  const selectedProperty = getSelectedProperty();

  if (
    selectedPostType === "property" &&
    !selectedProperty
  ) {

    toast("Choose one of your properties.", "error");

    return;
  }

  const publishButton = $("publishPost");

  setButtonLoading(
    publishButton,
    true,
    "Publishing"
  );

  try {

    let locationData = null;

    if ($("attachLocation").checked) {

      if (!userLocation) {

        locationData = await requestLiveLocation();

      } else {

        locationData = userLocation;
      }
    }

    const uploadedImages = [];

    for (let index = 0; index < selectedImages.length; index++) {

      const item = selectedImages[index];

      toast(
        `Uploading image ${index + 1} of ${selectedImages.length}...`,
        "info"
      );

      const result = await uploadImage(
        item.file,
        () => {}
      );

      uploadedImages.push({
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width || null,
        height: result.height || null,
        format: result.format || item.file.type,
        size: item.file.size,
        filename: item.file.name
      });
    }

    const postPayload = {

      type: selectedPostType,

      title:
        title ||
        "",

      content,

      authorId: currentUser.uid,

      authorName: displayName(),

      authorRole: displayRole(),

      authorPhotoURL:
        avatarURL(currentProfile) ||
        currentUser.photoURL ||
        "",

      imageCount: uploadedImages.length,

      images: uploadedImages,

      likeCount: 0,

      commentCount: 0,

      shareCount: 0,

      saveCount: 0,

      isQuestion:
        selectedPostType === "question",

      answered: false,

      location: locationData,

      propertyId:
        selectedProperty?.id ||
        null,

      propertySnapshot:
        selectedProperty
          ? {
              title:
                selectedProperty.title ||
                selectedProperty.name ||
                "",
              price:
                selectedProperty.price ||
                selectedProperty.amount ||
                null,
              address:
                selectedProperty.address ||
                selectedProperty.location ||
                "",
              image:
                selectedProperty.image ||
                selectedProperty.coverImage ||
                selectedProperty.imageUrl ||
                selectedProperty.images?.[0] ||
                ""
            }
          : null,

      createdAt: serverTimestamp(),

      updatedAt: serverTimestamp()
    };

    const postRef = await addDoc(
      collection(db, "communityPosts"),
      postPayload
    );

    if (locationData) {

      $("sidebarLocationText").textContent =
        locationData.label;
    }

    resetComposer();

    closeComposer();

    toast("Your post is now live.");

    document.getElementById("communityFeed")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

  } catch (error) {

    console.error("Create post error:", error);

    toast(
      error?.message ||
      "We could not publish your post. Please try again.",
      "error"
    );

  } finally {

    setButtonLoading(
      publishButton,
      false
    );
  }
}


/* ============================================================
   COMMUNITY FEED
============================================================ */

function normalizeCommunityPost(docSnap) {

  const data = docSnap.data() || {};

  return {
    id: docSnap.id,
    ...data,
    type: data.type || "discussion",
    title: typeof data.title === "string" ? data.title : "",
    content: typeof data.content === "string" ? data.content : "",
    authorId: data.authorId || "",
    authorName: data.authorName || "Community member",
    authorRole: data.authorRole || "buyer",
    likeCount: Number.isFinite(Number(data.likeCount)) ? Number(data.likeCount) : 0,
    commentCount: Number.isFinite(Number(data.commentCount)) ? Number(data.commentCount) : 0,
    shareCount: Number.isFinite(Number(data.shareCount)) ? Number(data.shareCount) : 0,
    saveCount: Number.isFinite(Number(data.saveCount)) ? Number(data.saveCount) : 0,
    images: Array.isArray(data.images) ? data.images : [],
    currentUserLiked: Boolean(data.currentUserLiked),
    currentUserSaved: Boolean(data.currentUserSaved)
  };
}

function sortCommunityPosts(posts) {

  return [...posts].sort((a, b) => {

    const aTime = a.createdAt?.toMillis
      ? a.createdAt.toMillis()
      : a.createdAt?.seconds
        ? Number(a.createdAt.seconds) * 1000
        : 0;

    const bTime = b.createdAt?.toMillis
      ? b.createdAt.toMillis()
      : b.createdAt?.seconds
        ? Number(b.createdAt.seconds) * 1000
        : 0;

    return bTime - aTime;
  });
}

function getFeedErrorMessage(error) {

  const code = String(error?.code || "")
    .replace(/^firestore\//, "");

  if (code === "permission-denied") {
    return {
      title: "Community access is restricted",
      text: "MoonLat could not read the community feed with the current account. Check the deployed Firestore communityPosts read rule and make sure your session is authenticated.",
      action: "Check access"
    };
  }

  if (code === "failed-precondition") {
    return {
      title: "Community feed needs a database index",
      text: "The live feed query was rejected by Firestore. MoonLat will retry with a client-side ordering fallback so the feed can continue working while the database index is resolved.",
      action: "Retry"
    };
  }

  if (code === "unauthenticated") {
    return {
      title: "Your session has expired",
      text: "Sign in again to reconnect to the MoonLat community.",
      action: "Sign in"
    };
  }

  if (code === "unavailable" || !navigator.onLine) {
    return {
      title: "Connection interrupted",
      text: "MoonLat could not reach the live community feed. Your connection may be temporarily unavailable.",
      action: "Retry"
    };
  }

  return {
    title: "Community feed unavailable",
    text: error?.message
      ? `MoonLat could not load the community feed (${code || "unknown-error"}).`
      : "MoonLat could not load the live community feed.",
    action: "Retry"
  };
}

function renderFeedError(error) {

  const state = getFeedErrorMessage(error);

  $("communityFeed").innerHTML = `
    <div class="feed-state">
      <div class="feed-state-icon">
        <i class="fas fa-triangle-exclamation"></i>
      </div>

      <div class="feed-state-title">
        ${escapeHTML(state.title)}
      </div>

      <div class="feed-state-text">
        ${escapeHTML(state.text)}
      </div>

      <button
        id="retryFeed"
        class="btn btn-primary mt-4"
        type="button"
      >
        ${escapeHTML(state.action)}
      </button>
    </div>
  `;

  $("retryFeed")?.addEventListener("click", () => {

    if (state.action === "Sign in") {
      window.location.href = "../sign-in.html";
      return;
    }

    subscribeToFeed();
  });
}

function attachFeedSnapshot(queryRef, allowFallback = true) {

  feedUnsubscribe = onSnapshot(
    queryRef,
    snapshot => {

      allPosts = sortCommunityPosts(
        snapshot.docs.map(normalizeCommunityPost)
      );

      updateCommunityMetrics();
      applyFeedFilters();

    },
    error => {

      console.error("Feed subscription error:", error);

      const code = String(error?.code || "")
        .replace(/^firestore\//, "");

      // A missing index must never permanently break the community UI.
      // Fall back to a simple live collection query and sort locally.
      if (code === "failed-precondition" && allowFallback) {

        if (feedUnsubscribe) {
          feedUnsubscribe();
          feedUnsubscribe = null;
        }

        const fallbackQuery = query(
          collection(db, "communityPosts"),
          limit(100)
        );

        attachFeedSnapshot(fallbackQuery, false);
        return;
      }

      renderFeedError(error);
    }
  );
}

function subscribeToFeed() {

  if (!currentUser) {
    return;
  }

  if (feedUnsubscribe) {
    feedUnsubscribe();
    feedUnsubscribe = null;
  }

  const feedQuery = query(
    collection(db, "communityPosts"),
    orderBy("createdAt", "desc"),
    limit(100)
  );

  attachFeedSnapshot(feedQuery);
}


/* ============================================================
   FILTERING
============================================================ */

function applyFeedFilters() {

  let result = [...allPosts];

  if (activeCategory !== "all") {

    result = result.filter(post => {

      if (activeCategory === "market") {
        return post.type === "market";
      }

      if (activeCategory === "investment") {
        return post.type === "investment";
      }

      if (activeCategory === "advice") {
        return post.type === "advice";
      }

      return post.type === activeCategory;
    });
  }


  if (searchTerm) {

    const search = searchTerm.toLowerCase();

    result = result.filter(post => {

      const haystack = [
        post.title,
        post.content,
        post.authorName,
        post.authorRole,
        post.propertySnapshot?.title,
        post.propertySnapshot?.address,
        post.location?.label
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }


  if (nearbyMode && userLocation) {

    result = result.filter(post => {

      if (!post.location) return false;

      const distance = calculateDistanceKm(
        userLocation.latitude,
        userLocation.longitude,
        post.location.latitude,
        post.location.longitude
      );

      return distance <= 25;
    });
  }


  if (activeSort === "popular") {

    result.sort(
      (a, b) =>
        (
          (b.likeCount || 0) +
          (b.commentCount || 0) * 2 +
          (b.shareCount || 0) * 2
        ) -
        (
          (a.likeCount || 0) +
          (a.commentCount || 0) * 2 +
          (a.shareCount || 0) * 2
        )
    );

  } else if (activeSort === "unanswered") {

    result = result.filter(
      post =>
        post.type === "question" &&
        !post.answered
    );
  }

  filteredPosts = result;

  renderFeed();
}


/* ============================================================
   DISTANCE
============================================================ */

function calculateDistanceKm(
  lat1,
  lon1,
  lat2,
  lon2
) {

  const R = 6371;

  const dLat =
    (lat2 - lat1) *
    Math.PI /
    180;

  const dLon =
    (lon2 - lon1) *
    Math.PI /
    180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}


/* ============================================================
   FEED RENDER
============================================================ */

function renderFeed() {

  const feed = $("communityFeed");

  $("feedCount").textContent =
    `${filteredPosts.length} ${filteredPosts.length === 1 ? "post" : "posts"}`;


  if (!filteredPosts.length) {

    const nearbyText =
      nearbyMode
        ? "No posts with live location were found within 25km of your current location."
        : searchTerm
          ? "Try a different search phrase or remove the current filters."
          : activeCategory === "question"
            ? "There are no questions here yet. Start the first one."
            : "This part of the community is quiet right now. Start the conversation.";

    feed.innerHTML = `
      <div class="feed-state">
        <div class="feed-state-icon">
          <i class="fas ${nearbyMode ? "fa-location-dot" : "fa-comments"}"></i>
        </div>

        <div class="feed-state-title">
          ${nearbyMode ? "Nothing nearby yet" : "Nothing here yet"}
        </div>

        <div class="feed-state-text">
          ${escapeHTML(nearbyText)}
        </div>

        <button
          id="emptyCreatePost"
          class="btn btn-primary mt-4"
          type="button"
        >
          <i class="fas fa-plus mr-1"></i>
          Start a post
        </button>
      </div>
    `;

    $("emptyCreatePost").addEventListener(
      "click",
      () => openComposer("discussion")
    );

    return;
  }


  feed.innerHTML =
    filteredPosts
      .map(renderPost)
      .join("");


  bindPostActions();
}


function renderPost(post) {

  const avatar =
    post.authorPhotoURL ||
    "";

  const authorInitials =
    getInitials(post.authorName || "User");

  const role =
    String(post.authorRole || "client").toLowerCase();

  const roleClass =
    role === "agent"
      ? "role-agent"
      : "role-client";

  const liked =
    Boolean(post.currentUserLiked);

  const saved =
    Boolean(post.currentUserSaved);


  const typeLabel =
    getPostTypeLabel(post.type);

  const typeIcon =
    getPostTypeIcon(post.type);


  let locationHTML = "";

  if (post.location) {

    let locationLabel =
      post.location.label ||
      `${post.location.latitude}, ${post.location.longitude}`;

    locationHTML = `
      <div class="post-location">
        <i class="fas fa-location-dot text-[9px]"></i>
        <span>
          ${escapeHTML(locationLabel)}
        </span>
      </div>
    `;
  }


  let propertyHTML = "";

  if (post.propertyId && post.propertySnapshot) {

    const property = post.propertySnapshot;

    propertyHTML = `
      <div
        class="property-share"
        data-property-id="${escapeHTML(post.propertyId)}"
      >

        ${
          property.image
            ? `
              <div class="property-share-image">
                <img
                  src="${escapeHTML(property.image)}"
                  alt="${escapeHTML(property.title || "Property")}"
                  loading="lazy"
                >
              </div>
            `
            : ""
        }

        <div class="property-share-info">

          ${
            property.price
              ? `
                <div class="property-share-price">
                  ${escapeHTML(String(property.price))}
                </div>
              `
              : ""
          }

          <div class="property-share-title">
            ${escapeHTML(property.title || "Property")}
          </div>

          ${
            property.address
              ? `
                <div class="property-share-location">
                  <i class="fas fa-location-dot"></i>
                  ${escapeHTML(property.address)}
                </div>
              `
              : ""
          }

        </div>

      </div>
    `;
  }


  const images =
    Array.isArray(post.images)
      ? post.images.filter(image => image?.url)
      : [];


  let imagesHTML = "";

  if (images.length) {

    let layout =
      images.length === 1
        ? "single"
        : images.length === 2
          ? "two"
          : images.length === 3
            ? "three"
            : "multi";

    const visibleImages =
      images.slice(0, 4);

    imagesHTML = `
      <div class="post-images ${layout}">

        ${visibleImages.map((image, index) => {

          const remaining =
            images.length - 4;

          return `
            <button
              class="post-image"
              type="button"
              data-image-url="${escapeHTML(image.url)}"
              aria-label="Open image"
            >

              <img
                src="${escapeHTML(image.url)}"
                alt="${escapeHTML(image.filename || "Community image")}"
                loading="lazy"
              >

              ${
                index === 3 && remaining > 0
                  ? `
                    <div class="more-images">
                      +${remaining}
                    </div>
                  `
                  : ""
              }

            </button>
          `;

        }).join("")}

      </div>
    `;
  }


  return `
    <article
      class="post-card"
      data-post-id="${escapeHTML(post.id)}"
    >

      <div class="post-body">

        <div class="post-header">

          <div class="user-avatar">

            ${
              avatar
                ? `
                  <img
                    src="${escapeHTML(avatar)}"
                    alt="${escapeHTML(post.authorName || "User")}"
                    loading="lazy"
                  >
                `
                : escapeHTML(authorInitials)
            }

          </div>

          <div class="post-author">

            <div class="post-author-line">

              <span class="post-author-name">
                ${escapeHTML(post.authorName || "Community member")}
              </span>

              <span class="role-badge ${roleClass}">
                ${escapeHTML(role)}
              </span>

            </div>

            <div class="post-time">
              ${formatRelativeTime(post.createdAt)}
            </div>

          </div>

          <button
            class="post-menu"
            type="button"
            data-action="menu"
            aria-label="Post options"
          >
            <i class="fas fa-ellipsis"></i>
          </button>

        </div>

        <div class="post-type">
          <i class="fas ${typeIcon}"></i>
          ${escapeHTML(typeLabel)}
        </div>

        ${
          post.title
            ? `
              <h2 class="post-title">
                ${escapeHTML(post.title)}
              </h2>
            `
            : ""
        }

        ${
          post.content
            ? `
              <div class="post-content">
                ${escapeHTML(post.content)}
              </div>
            `
            : ""
        }

        ${locationHTML}

        ${propertyHTML}

      </div>

      ${imagesHTML}

      <div class="post-body">

        <div class="post-actions">

          <div class="post-actions-left">

            <button
              class="post-action ${liked ? "liked" : ""}"
              type="button"
              data-action="like"
              data-post-id="${escapeHTML(post.id)}"
            >
              <i class="${liked ? "fas" : "far"} fa-heart"></i>
              <span>${formatNumber(post.likeCount || 0)}</span>
            </button>

            <button
              class="post-action"
              type="button"
              data-action="comment"
              data-post-id="${escapeHTML(post.id)}"
            >
              <i class="far fa-comment"></i>
              <span>${formatNumber(post.commentCount || 0)}</span>
            </button>

            <button
              class="post-action"
              type="button"
              data-action="share"
              data-post-id="${escapeHTML(post.id)}"
            >
              <i class="fas fa-share"></i>
              <span>${formatNumber(post.shareCount || 0)}</span>
            </button>

          </div>

          <button
            class="post-action ${saved ? "saved" : ""}"
            type="button"
            data-action="save"
            data-post-id="${escapeHTML(post.id)}"
            aria-label="Save post"
          >
            <i class="${saved ? "fas" : "far"} fa-bookmark"></i>
          </button>

        </div>

      </div>

    </article>
  `;
}


/* ============================================================
   POST ACTIONS
============================================================ */

function bindPostActions() {

  document
    .querySelectorAll("[data-action]")
    .forEach(button => {

      button.addEventListener(
        "click",
        async event => {

          event.stopPropagation();

          const action =
            button.dataset.action;

          const postId =
            button.dataset.postId;


          if (action === "like") {

            await toggleLike(postId, button);

          } else if (action === "comment") {

            openComments(postId);

          } else if (action === "share") {

            await sharePost(postId);

          } else if (action === "save") {

            await toggleSave(postId, button);

          } else if (action === "menu") {

            const article =
              button.closest(".post-card");

            const id =
              article?.dataset.postId;

            openPostMenu(id);
          }
        }
      );
    });


  document
    .querySelectorAll("[data-image-url]")
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          openImageViewer(
            button.dataset.imageUrl
          );
        }
      );
    });


  document
    .querySelectorAll(".property-share")
    .forEach(element => {

      element.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          const propertyId =
            element.dataset.propertyId;

          if (propertyId) {

            window.location.href =
              `property.html?id=${encodeURIComponent(propertyId)}`;
          }
        }
      );
    });
}


/* ============================================================
   LIKE
============================================================ */

async function toggleLike(postId, button) {

  if (!currentUser) return;

  if (!isOnline()) {

    toast("You are offline.", "error");

    return;
  }

  const reactionRef = doc(
    db,
    "communityPosts",
    postId,
    "reactions",
    currentUser.uid
  );

  try {

    await runTransaction(
      db,
      async transaction => {

        const reactionSnap =
          await transaction.get(reactionRef);

        const postRef =
          doc(db, "communityPosts", postId);

        const postSnap =
          await transaction.get(postRef);

        if (!postSnap.exists()) {
          throw new Error("This post no longer exists.");
        }

        if (reactionSnap.exists()) {

          transaction.delete(reactionRef);

          transaction.update(
            postRef,
            {
              likeCount: increment(-1),
              updatedAt: serverTimestamp()
            }
          );

        } else {

          transaction.set(
            reactionRef,
            {
              userId: currentUser.uid,
              createdAt: serverTimestamp()
            }
          );

          transaction.update(
            postRef,
            {
              likeCount: increment(1),
              updatedAt: serverTimestamp()
            }
          );
        }
      }
    );

  } catch (error) {

    console.error("Like error:", error);

    toast(
      error.message || "Could not update reaction.",
      "error"
    );
  }
}


/* ============================================================
   SAVE
============================================================ */

async function toggleSave(postId, button) {

  if (!currentUser) return;

  try {

    const ref = doc(
      db,
      "users",
      currentUser.uid,
      "savedPosts",
      postId
    );

    const snap = await getDoc(ref);

    const postRef =
      doc(db, "communityPosts", postId);

    if (snap.exists()) {

      await deleteDoc(ref);

      await updateDoc(
        postRef,
        {
          saveCount: increment(-1)
        }
      );

      toast("Removed from saved posts.", "info");

    } else {

      await setDoc(
        ref,
        {
          postId,
          savedAt: serverTimestamp()
        }
      );

      await updateDoc(
        postRef,
        {
          saveCount: increment(1)
        }
      );

      toast("Post saved.");

    }

  } catch (error) {

    console.error("Save error:", error);

    toast(
      "Could not update saved posts.",
      "error"
    );
  }
}


/* ============================================================
   SHARE
============================================================ */

async function sharePost(postId) {

  const url =
    `${window.location.origin}${window.location.pathname}?post=${encodeURIComponent(postId)}`;

  try {

    if (navigator.share) {

      await navigator.share({
        title: "MoonLat Community",
        text: "View this community post on MoonLat.",
        url
      });

    } else {

      await navigator.clipboard.writeText(url);

      toast("Community link copied.");
    }

    await updateDoc(
      doc(db, "communityPosts", postId),
      {
        shareCount: increment(1)
      }
    );

  } catch (error) {

    if (error?.name === "AbortError") return;

    console.error("Share error:", error);

    try {

      await navigator.clipboard.writeText(url);

      toast("Community link copied.");

    } catch {

      toast(
        "Could not share this post.",
        "error"
      );
    }
  }
}


/* ============================================================
   POST MENU
============================================================ */

async function openPostMenu(postId) {

  const post =
    allPosts.find(item => item.id === postId);

  if (!post) return;

  const isOwner =
    post.authorId === currentUser.uid;

  if (isOwner) {

    const remove =
      window.confirm(
        "Delete this community post?"
      );

    if (!remove) return;

    try {

      await deleteDoc(
        doc(db, "communityPosts", postId)
      );

      toast("Post deleted.");

    } catch (error) {

      console.error(error);

      toast(
        "Could not delete the post.",
        "error"
      );
    }

    return;
  }

  const report =
    window.confirm(
      "Report this post to MoonLat moderation?"
    );

  if (!report) return;

  currentReportPostId = postId;

  $("reportModal").classList.add("open");

  document.body.classList.add("modal-open");
}


/* ============================================================
   REPORT
============================================================ */

async function submitReport(event) {

  event.preventDefault();

  if (!currentReportPostId || !currentUser) return;

  const reason =
    $("reportReason").value;

  const details =
    $("reportDetails").value.trim();

  if (!reason) {

    toast("Choose a report reason.", "error");

    return;
  }

  const button =
    $("reportForm").querySelector(
      'button[type="submit"]'
    );

  setButtonLoading(
    button,
    true,
    "Submitting"
  );

  try {

    await addDoc(
      collection(db, "communityReports"),
      {
        postId: currentReportPostId,
        reporterId: currentUser.uid,
        reason,
        details,
        status: "open",
        createdAt: serverTimestamp()
      }
    );

    $("reportForm").reset();

    $("reportModal").classList.remove("open");

    document.body.classList.remove("modal-open");

    toast("Report submitted to moderation.");

  } catch (error) {

    console.error("Report error:", error);

    toast(
      "Could not submit the report.",
      "error"
    );

  } finally {

    setButtonLoading(
      button,
      false
    );
  }
}


/* ============================================================
   COMMENTS
============================================================ */

function openComments(postId) {

  currentCommentsPostId = postId;

  const post =
    allPosts.find(item => item.id === postId);

  $("commentsPostTitle").textContent =
    post?.title ||
    "Community conversation";

  $("commentsModal").classList.add("open");

  document.body.classList.add("modal-open");

  subscribeToComments(postId);
}


function closeComments() {

  if (commentsUnsubscribe) {

    commentsUnsubscribe();

    commentsUnsubscribe = null;
  }

  currentCommentsPostId = null;

  $("commentsModal").classList.remove("open");

  document.body.classList.remove("modal-open");
}


function subscribeToComments(postId) {

  if (commentsUnsubscribe) {

    commentsUnsubscribe();
  }

  const q = query(
    collection(
      db,
      "communityPosts",
      postId,
      "comments"
    ),
    orderBy("createdAt", "asc"),
    limit(100)
  );

  commentsUnsubscribe = onSnapshot(
    q,
    snapshot => {

      const comments =
        snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }));

      renderComments(comments);
    },
    error => {

      console.error(
        "Comments error:",
        error
      );

      $("commentList").innerHTML = `
        <div class="feed-state">
          <div class="feed-state-icon">
            <i class="fas fa-triangle-exclamation"></i>
          </div>

          <div class="feed-state-title">
            Comments unavailable
          </div>

          <div class="feed-state-text">
            We could not load this conversation.
          </div>
        </div>
      `;
    }
  );
}


function renderComments(comments) {

  if (!comments.length) {

    $("commentList").innerHTML = `
      <div class="feed-state">
        <div class="feed-state-icon">
          <i class="far fa-comment"></i>
        </div>

        <div class="feed-state-title">
          No replies yet
        </div>

        <div class="feed-state-text">
          Be the first person to add something useful to this conversation.
        </div>
      </div>
    `;

    return;
  }

  $("commentList").innerHTML =
    comments.map(comment => {

      const initials =
        getInitials(
          comment.authorName || "User"
        );

      const avatar =
        comment.authorPhotoURL || "";

      return `
        <div class="comment">

          <div class="user-avatar !w-8 !h-8 !rounded-[10px] !text-[8px]">
            ${
              avatar
                ? `
                  <img
                    src="${escapeHTML(avatar)}"
                    alt="${escapeHTML(comment.authorName || "User")}"
                    loading="lazy"
                  >
                `
                : escapeHTML(initials)
            }
          </div>

          <div class="comment-content">

            <div class="comment-author">
              ${escapeHTML(comment.authorName || "Community member")}
            </div>

            <div class="comment-text">
              ${escapeHTML(comment.text || "")}
            </div>

            <div class="comment-time">
              ${formatRelativeTime(comment.createdAt)}
            </div>

          </div>

        </div>
      `;

    }).join("");
}


async function submitComment(event) {

  event.preventDefault();

  if (!currentCommentsPostId || !currentUser) return;

  const input =
    $("commentInput");

  const text =
    input.value.trim();

  if (!text) return;

  const button =
    $("commentForm").querySelector(
      'button[type="submit"]'
    );

  setButtonLoading(
    button,
    true,
    "Sending"
  );

  try {

    const commentRef =
      collection(
        db,
        "communityPosts",
        currentCommentsPostId,
        "comments"
      );

    await addDoc(
      commentRef,
      {
        text,
        authorId: currentUser.uid,
        authorName: displayName(),
        authorPhotoURL:
          avatarURL(currentProfile) ||
          currentUser.photoURL ||
          "",
        createdAt: serverTimestamp()
      }
    );

    await updateDoc(
      doc(
        db,
        "communityPosts",
        currentCommentsPostId
      ),
      {
        commentCount: increment(1),
        updatedAt: serverTimestamp()
      }
    );

    input.value = "";

    toast("Reply added.");

  } catch (error) {

    console.error("Comment error:", error);

    toast(
      "Could not add your reply.",
      "error"
    );

  } finally {

    setButtonLoading(
      button,
      false
    );
  }
}


/* ============================================================
   NOTIFICATIONS
============================================================ */

function subscribeToNotifications() {

  if (!currentUser) return;

  if (notificationUnsubscribe) {
    notificationUnsubscribe();
  }

  try {

    // Keep this query single-field so the community page does not depend
    // on a composite Firestore index just to render the notification dot.
    // We filter unread notifications client-side after the authenticated
    // user's notification documents have been securely returned.
    const q = query(
      collection(
        db,
        "notifications"
      ),
      where(
        "userId",
        "==",
        currentUser.uid
      ),
      limit(50)
    );

    notificationUnsubscribe =
      onSnapshot(
        q,
        snapshot => {

          const hasUnread = snapshot.docs.some(
            docSnap => docSnap.data()?.read !== true
          );

          $("notificationDot")
            .classList.toggle(
              "hidden",
              !hasUnread
            );
        },
        error => {

          console.warn(
            "Notification listener unavailable:",
            error
          );
        }
      );

  } catch (error) {

    console.warn(
      "Notification setup error:",
      error
    );
  }
}


/* ============================================================
   METRICS
============================================================ */

function updateCommunityMetrics() {

  const posts =
    allPosts.length;

  const photos =
    allPosts.filter(
      post =>
        Array.isArray(post.images) &&
        post.images.length
    ).length;

  const questions =
    allPosts.filter(
      post =>
        post.type === "question"
    ).length;

  const propertiesCount =
    allPosts.filter(
      post =>
        post.propertyId
    ).length;


  $("communityPostCount").textContent =
    formatNumber(posts);

  $("communityPhotoCount").textContent =
    formatNumber(photos);

  $("sidePosts").textContent =
    formatNumber(posts);

  $("sideQuestions").textContent =
    formatNumber(questions);

  $("sideProperties").textContent =
    formatNumber(propertiesCount);

  $("sidePhotos").textContent =
    formatNumber(photos);


  const uniqueMembers =
    new Set(
      allPosts
        .map(post => post.authorId)
        .filter(Boolean)
    ).size;

  $("communityMemberCount").textContent =
    formatNumber(uniqueMembers);
}


/* ============================================================
   SEARCH
============================================================ */

function handleSearch(value) {

  searchTerm =
    value.trim();

  $("clearSearch")
    .classList.toggle(
      "hidden",
      !searchTerm
    );

  applyFeedFilters();
}


/* ============================================================
   NEARBY
============================================================ */

async function toggleNearby() {

  if (nearbyMode) {

    nearbyMode = false;

    $("locationFilterButton")
      .classList.remove("active");

    $("locationFilterButton")
      .innerHTML = `
        <i class="fas fa-location-crosshairs"></i>
        <span>Nearby</span>
      `;

    applyFeedFilters();

    return;
  }

  try {

    toast(
      "Requesting your location...",
      "info"
    );

    const location =
      await requestLiveLocation();

    userLocation = location;

    nearbyMode = true;

    $("locationFilterButton")
      .classList.add("active");

    $("locationFilterButton")
      .innerHTML = `
        <i class="fas fa-location-dot"></i>
        <span>Nearby</span>
      `;

    $("sidebarLocationText").textContent =
      location.label;

    applyFeedFilters();

    toast(
      "Nearby community posts enabled."
    );

  } catch (error) {

    toast(
      error.message,
      "error"
    );
  }
}


/* ============================================================
   IMAGE VIEWER
============================================================ */

function openImageViewer(url) {

  if (!url) return;

  $("viewerImage").src = url;

  $("imageViewer")
    .classList.add("open");

  document.body.classList.add("modal-open");
}


function closeImageViewer() {

  $("imageViewer")
    .classList.remove("open");

  $("viewerImage").src = "";

  document.body.classList.remove("modal-open");
}


/* ============================================================
   DEEP LINK
============================================================ */

function handleDeepLink() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const postId =
    params.get("post");

  if (!postId) return;

  const openWhenReady = () => {

    const exists =
      allPosts.some(
        post => post.id === postId
      );

    if (!exists) return;

    openComments(postId);
  };

  setTimeout(
    openWhenReady,
    900
  );
}


/* ============================================================
   EVENTS
============================================================ */

$("openComposer")
  .addEventListener(
    "click",
    () => openComposer()
  );


$("mobileCreate")
  .addEventListener(
    "click",
    () => openComposer()
  );


document
  .querySelectorAll("[data-open-type]")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        openComposer(
          button.dataset.openType
        );
      }
    );
  });


document
  .querySelectorAll(".post-type-option")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        selectedPostType =
          button.dataset.postType;

        document
          .querySelectorAll(".post-type-option")
          .forEach(item => {

            item.classList.toggle(
              "active",
              item === button
            );
          });

        updateComposerFields();
      }
    );
  });


$("closeComposer")
  .addEventListener(
    "click",
    closeComposer
  );


$("cancelComposer")
  .addEventListener(
    "click",
    () => {

      resetComposer();

      closeComposer();
    }
  );


$("postForm")
  .addEventListener(
    "submit",
    createPost
  );


$("postContent")
  .addEventListener(
    "input",
    () => {

      const length =
        $("postContent").value.length;

      $("characterCount").textContent =
        `${length} / 5000`;
    }
  );


$("chooseImages")
  .addEventListener(
    "click",
    () => $("postImages").click()
  );


$("postImages")
  .addEventListener(
    "change",
    event => {

      handleImageSelection(
        event.target.files
      );

      event.target.value = "";
    }
  );


$("attachLocation")
  .addEventListener(
    "change",
    handleLocationToggle
  );


document
  .querySelectorAll(".category-btn")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(".category-btn")
          .forEach(item =>
            item.classList.remove("active")
          );

        button.classList.add("active");

        activeCategory =
          button.dataset.category;

        applyFeedFilters();
      }
    );
  });


document
  .querySelectorAll(".feed-tab")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(".feed-tab")
          .forEach(item =>
            item.classList.remove("active")
          );

        button.classList.add("active");

        activeSort =
          button.dataset.sort;

        applyFeedFilters();
      }
    );
  });


$("communitySearch")
  .addEventListener(
    "input",
    event => {

      handleSearch(
        event.target.value
      );
    }
  );


$("clearSearch")
  .addEventListener(
    "click",
    () => {

      $("communitySearch").value = "";

      handleSearch("");

      $("communitySearch").focus();
    }
  );


$("headerSearchButton")
  .addEventListener(
    "click",
    () => {

      $("communitySearch").focus();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  );


$("mobileSearch")
  .addEventListener(
    "click",
    () => {

      $("communitySearch").focus();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  );


$("locationFilterButton")
  .addEventListener(
    "click",
    toggleNearby
  );


$("closeComments")
  .addEventListener(
    "click",
    closeComments
  );


$("commentForm")
  .addEventListener(
    "submit",
    submitComment
  );


$("closeImageViewer")
  .addEventListener(
    "click",
    closeImageViewer
  );


$("notificationButton")
  .addEventListener(
    "click",
    () => {

      window.location.href =
        "alert.html";
    }
  );


$("mobileNotifications")
  .addEventListener(
    "click",
    () => {

      window.location.href =
        "alert.html";
    }
  );


$("closeReport")
  .addEventListener(
    "click",
    () => {

      $("reportModal")
        .classList.remove("open");

      document.body.classList.remove("modal-open");
    }
  );


$("cancelReport")
  .addEventListener(
    "click",
    () => {

      $("reportModal")
        .classList.remove("open");

      document.body.classList.remove("modal-open");
    }
  );


$("reportForm")
  .addEventListener(
    "submit",
    submitReport
  );


$("composerModal")
  .addEventListener(
    "click",
    event => {

      if (event.target === $("composerModal")) {

        resetComposer();

        closeComposer();
      }
    }
  );


$("commentsModal")
  .addEventListener(
    "click",
    event => {

      if (event.target === $("commentsModal")) {
        closeComments();
      }
    }
  );


$("reportModal")
  .addEventListener(
    "click",
    event => {

      if (event.target === $("reportModal")) {

        $("reportModal")
          .classList.remove("open");

        document.body.classList.remove("modal-open");
      }
    }
  );


$("imageViewer")
  .addEventListener(
    "click",
    event => {

      if (
        event.target === $("imageViewer") ||
        event.target === $("viewerImage")
      ) {

        closeImageViewer();
      }
    }
  );


document.addEventListener(
  "keydown",
  event => {

    if (event.key !== "Escape") return;

    if ($("composerModal").classList.contains("open")) {

      resetComposer();

      closeComposer();

      return;
    }

    if ($("commentsModal").classList.contains("open")) {

      closeComments();

      return;
    }

    if ($("reportModal").classList.contains("open")) {

      $("reportModal")
        .classList.remove("open");

      document.body.classList.remove("modal-open");

      return;
    }

    if ($("imageViewer").classList.contains("open")) {

      closeImageViewer();
    }
  }
);


/* ============================================================
   AUTH INITIALIZATION
============================================================ */

onAuthStateChanged(
  auth,
  async user => {

    if (!user) {

      window.location.href =
        "../sign-in.html";

      return;
    }

    currentUser = user;

    try {

      await loadCurrentProfile(user);

      await loadProperties();

      subscribeToFeed();

      subscribeToNotifications();

      handleDeepLink();

    } catch (error) {

      console.error(
        "Community initialization error:",
        error
      );

      toast(
        "Some community features could not be initialized.",
        "error"
      );
    }
  }
);

