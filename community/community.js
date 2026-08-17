/* ============================================================
   MOONLAT COMMUNITY - PRODUCTION COMMUNITY ENGINE

   Firebase configuration is supplied by index.html:

   <script>
   window.MOONLAT_FIREBASE_CONFIG = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   </script>

   Then:

   <script type="module" src="./community.js"></script>

   Responsibilities:
   - Firebase initialization
   - Authentication
   - User profile loading
   - Property loading
   - Live community feed
   - Search/filtering/sorting
   - Persistent likes
   - Persistent saves
   - Comments
   - Comment counters
   - Sharing
   - Notifications
   - Reporting/moderation
   - Cloudinary uploads
   - Geolocation
   - Image viewer
   - Deep-linking
   - Responsive community interactions

   The HTML IDs/data attributes are preserved.
============================================================ */


/* ============================================================
   FIREBASE IMPORTS
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


/* ============================================================
   FIREBASE CONFIGURATION
============================================================ */

const firebaseConfig =
  window.MOONLAT_FIREBASE_CONFIG;

if (
  !firebaseConfig ||
  typeof firebaseConfig !== "object"
) {
  throw new Error(
    "MoonLat Community: Firebase configuration was not found. Add window.MOONLAT_FIREBASE_CONFIG to the HTML <head> before community.js."
  );
}

const requiredFirebaseKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId"
];

const missingFirebaseKeys =
  requiredFirebaseKeys.filter(
    key =>
      !firebaseConfig[key]
  );

if (missingFirebaseKeys.length) {
  throw new Error(
    `MoonLat Community: Firebase configuration is incomplete. Missing: ${missingFirebaseKeys.join(", ")}`
  );
}

const app =
  initializeApp(firebaseConfig);

const auth =
  getAuth(app);

const db =
  getFirestore(app);


/* ============================================================
   CLOUDINARY
============================================================ */

const CLOUDINARY_CLOUD_NAME =
  "dxdbn6xwy";

const CLOUDINARY_UPLOAD_PRESET =
  "geefox_unsigned";

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


/*
 * Persistent per-user reaction state.
 *
 * communityPosts contains aggregate counters.
 *
 * These Sets represent the current authenticated user's
 * relationship with each post.
 */
const likedPostIds =
  new Set();

const savedPostIds =
  new Set();


/*
 * Prevents double clicks/taps and concurrent mutations.
 */
const pendingActions =
  new Set();


/*
 * Prevents duplicate notification creation within the
 * current client session.
 */
const notificationGuards =
  new Set();


/*
 * Prevents deep links from opening repeatedly every time
 * the feed receives another snapshot.
 */
let deepLinkHandled = false;


/*
 * Used to prevent repeated authentication initialization
 * if Firebase emits the same user state more than once.
 */
let initializedUserId = null;


/* ============================================================
   DOM
============================================================ */

const $ = id =>
  document.getElementById(id);

function requiredElement(id) {
  const element = $(id);

  if (!element) {
    console.warn(
      `MoonLat Community: missing element #${id}`
    );
  }

  return element;
}


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
  const parts =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (!parts.length) {
    return "U";
  }

  return parts
    .slice(0, 2)
    .map(part =>
      part.charAt(0)
    )
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
  return String(
    currentProfile?.role ||
    currentUser?.role ||
    "client"
  ).toLowerCase();
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


function timestampMillis(timestamp) {
  if (!timestamp) {
    return 0;
  }

  if (
    typeof timestamp.toMillis ===
    "function"
  ) {
    return timestamp.toMillis();
  }

  if (
    typeof timestamp.toDate ===
    "function"
  ) {
    return timestamp
      .toDate()
      .getTime();
  }

  if (
    typeof timestamp.seconds ===
    "number"
  ) {
    return (
      Number(timestamp.seconds) *
      1000
    );
  }

  const parsed =
    new Date(timestamp).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}


function formatRelativeTime(timestamp) {
  const millis =
    timestampMillis(timestamp);

  if (!millis) {
    return "Just now";
  }

  const seconds =
    Math.floor(
      (Date.now() - millis) / 1000
    );

  if (seconds < 10) {
    return "Just now";
  }

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes =
    Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days =
    Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  const date =
    new Date(millis);

  const now =
    new Date();

  return date.toLocaleDateString(
    undefined,
    {
      day: "numeric",
      month: "short",
      year:
        date.getFullYear() !==
        now.getFullYear()
          ? "numeric"
          : undefined
    }
  );
}


function formatNumber(number = 0) {
  const value =
    Number(number) || 0;

  if (value >= 1000000) {
    return `${(
      value / 1000000
    ).toFixed(
      value >= 10000000
        ? 0
        : 1
    )}M`;
  }

  if (value >= 1000) {
    return `${(
      value / 1000
    ).toFixed(
      value >= 10000
        ? 0
        : 1
    )}k`;
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

  return (
    labels[type] ||
    "Community"
  );
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

  return (
    icons[type] ||
    "fa-message"
  );
}


function isOnline() {
  return navigator.onLine;
}


function actionKey(
  action,
  postId
) {
  return `${action}:${postId}`;
}


function beginAction(key) {
  if (
    pendingActions.has(key)
  ) {
    return false;
  }

  pendingActions.add(key);

  return true;
}


function endAction(key) {
  pendingActions.delete(key);
}


function setButtonLoading(
  button,
  loading,
  label = "Please wait"
) {
  if (!button) {
    return;
  }

  if (loading) {
    if (
      !button.dataset
        .originalLabel
    ) {
      button.dataset.originalLabel =
        button.innerHTML;
    }

    button.disabled = true;

    button.setAttribute(
      "aria-busy",
      "true"
    );

    button.innerHTML = `
      <i class="fas fa-spinner fa-spin mr-1"></i>
      ${escapeHTML(label)}
    `;
  } else {
    button.disabled = false;

    button.removeAttribute(
      "aria-busy"
    );

    if (
      button.dataset
        .originalLabel
    ) {
      button.innerHTML =
        button.dataset.originalLabel;

      delete button.dataset
        .originalLabel;
    }
  }
}


/* ============================================================
   TOAST
============================================================ */

function toast(
  message,
  type = "success"
) {
  const stack =
    $("toastStack");

  if (!stack) {
    return;
  }

  const item =
    document.createElement("div");

  item.className =
    `toast ${type}`;

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

    <div class="toast-message">
      ${escapeHTML(message)}
    </div>

    <button
      class="toast-close"
      type="button"
      aria-label="Close notification"
    >
      <i class="fas fa-xmark text-[10px]"></i>
    </button>
  `;

  stack.appendChild(item);

  const remove =
    () => {
      item.style.opacity =
        "0";

      item.style.transform =
        "translateY(5px)";

      setTimeout(
        () => item.remove(),
        180
      );
    };

  item
    .querySelector(
      ".toast-close"
    )
    ?.addEventListener(
      "click",
      remove
    );

  setTimeout(
    remove,
    4000
  );
}


/* ============================================================
   NETWORK
============================================================ */

function updateNetworkState() {
  $("networkBanner")
    ?.classList.toggle(
      "show",
      !navigator.onLine
    );
}


window.addEventListener(
  "online",
  updateNetworkState
);

window.addEventListener(
  "offline",
  updateNetworkState
);

updateNetworkState();


/* ============================================================
   IDENTITY
============================================================ */

async function loadCurrentProfile(
  user
) {
  try {
    const snap =
      await getDoc(
        doc(
          db,
          "users",
          user.uid
        )
      );

    if (snap.exists()) {
      currentProfile = {
        id: snap.id,
        ...snap.data()
      };
    } else {
      currentProfile = {
        id: user.uid,
        displayName:
          user.displayName ||
          user.email
            ?.split("@")[0] ||
          "User",
        role: "client",
        photoURL:
          user.photoURL ||
          ""
      };
    }
  } catch (error) {
    console.error(
      "Profile load error:",
      error
    );

    currentProfile = {
      id: user.uid,
      displayName:
        user.displayName ||
        user.email
          ?.split("@")[0] ||
        "User",
      role: "client",
      photoURL:
        user.photoURL ||
        ""
    };
  }

  updateIdentityUI();
}


function updateIdentityUI() {
  const name =
    displayName();

  const role =
    displayRole();

  const avatar =
    avatarURL(
      currentProfile
    );

  const targets = [
    $("composerAvatar"),
    $("modalAuthorAvatar")
  ];

  targets.forEach(
    element => {
      if (!element) {
        return;
      }

      if (avatar) {
        element.innerHTML = `
          <img
            src="${escapeHTML(avatar)}"
            alt="${escapeHTML(name)}"
            loading="lazy"
          >
        `;
      } else {
        element.textContent =
          getInitials(name);
      }
    }
  );

  const headerAvatar =
    $("headerAvatar");

  if (headerAvatar) {
    if (avatar) {
      headerAvatar.innerHTML = `
        <img
          src="${escapeHTML(avatar)}"
          alt="${escapeHTML(name)}"
        >
      `;
    } else {
      headerAvatar.textContent =
        getInitials(name);
    }
  }

  if ($("modalAuthorName")) {
    $("modalAuthorName")
      .textContent = name;
  }

  if ($("modalAuthorRole")) {
    $("modalAuthorRole")
      .textContent =
      role === "agent"
        ? "Verified agent"
        : role === "admin"
          ? "Administrator"
          : role === "moderator"
            ? "Moderator"
            : "Community member";
  }
}


/* ============================================================
   PROPERTIES
============================================================ */

async function loadProperties() {
  if (!currentUser) {
    return;
  }

  try {
    const q =
      query(
        collection(
          db,
          "properties"
        ),
        where(
          "ownerId",
          "==",
          currentUser.uid
        ),
        limit(100)
      );

    const snap =
      await getDocs(q);

    properties =
      snap.docs.map(
        docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        })
      );

    populatePropertySelector();
  } catch (error) {
    console.error(
      "Property load error:",
      error
    );

    properties = [];

    populatePropertySelector();
  }
}


function populatePropertySelector() {
  const select =
    $("propertySelect");

  if (!select) {
    return;
  }

  select.innerHTML = `
    <option value="">
      Choose one of your properties
    </option>
  `;

  properties.forEach(
    property => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        property.id;

      option.textContent =
        property.title ||
        property.name ||
        property.address ||
        "Untitled property";

      select.appendChild(
        option
      );
    }
  );
}


function getSelectedProperty() {
  const select =
    $("propertySelect");

  if (!select) {
    return null;
  }

  const id =
    select.value;

  if (!id) {
    return null;
  }

  return (
    properties.find(
      property =>
        property.id === id
    ) ||
    null
  );
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

  if (
    !allowed.includes(
      file.type
    )
  ) {
    throw new Error(
      `${file.name}: unsupported image format.`
    );
  }

  const maxSize =
    10 * 1024 * 1024;

  if (
    file.size > maxSize
  ) {
    throw new Error(
      `${file.name}: image must be 10MB or smaller.`
    );
  }
}


async function uploadImage(
  file,
  onProgress
) {
  validateImage(file);

  const formData =
    new FormData();

  formData.append(
    "file",
    file
  );

  formData.append(
    "upload_preset",
    CLOUDINARY_UPLOAD_PRESET
  );

  formData.append(
    "folder",
    "moonlat_community"
  );

  return new Promise(
    (resolve, reject) => {
      const xhr =
        new XMLHttpRequest();

      xhr.open(
        "POST",
        CLOUDINARY_UPLOAD_URL,
        true
      );

      xhr.upload.addEventListener(
        "progress",
        event => {
          if (
            !event.lengthComputable ||
            !onProgress
          ) {
            return;
          }

          onProgress(
            Math.round(
              (event.loaded /
                event.total) *
                100
            )
          );
        }
      );

      xhr.addEventListener(
        "load",
        () => {
          if (
            xhr.status >= 200 &&
            xhr.status < 300
          ) {
            try {
              resolve(
                JSON.parse(
                  xhr.responseText
                )
              );
            } catch {
              reject(
                new Error(
                  "Invalid upload response."
                )
              );
            }

            return;
          }

          let message =
            "Image upload failed.";

          try {
            const response =
              JSON.parse(
                xhr.responseText
              );

            if (
              response?.error?.message
            ) {
              message =
                response.error.message;
            }
          } catch {}

          reject(
            new Error(message)
          );
        }
      );

      xhr.addEventListener(
        "error",
        () => {
          reject(
            new Error(
              "Network error while uploading image."
            )
          );
        }
      );

      xhr.addEventListener(
        "abort",
        () => {
          reject(
            new Error(
              "Image upload was cancelled."
            )
          );
        }
      );

      xhr.send(formData);
    }
  );
}


/* ============================================================
   IMAGE SELECTION
============================================================ */

function renderImagePreviews() {
  const grid =
    $("imagePreviewGrid");

  if (!grid) {
    return;
  }

  grid.innerHTML = "";

  if (!selectedImages.length) {
    grid.classList.add(
      "hidden"
    );

    return;
  }

  grid.classList.remove(
    "hidden"
  );

  selectedImages.forEach(
    (item, index) => {
      const wrapper =
        document.createElement(
          "div"
        );

      wrapper.className =
        "preview-item";

      const image =
        document.createElement(
          "img"
        );

      image.src =
        item.preview;

      image.alt =
        item.file.name;

      image.loading =
        "lazy";

      const remove =
        document.createElement(
          "button"
        );

      remove.type =
        "button";

      remove.className =
        "preview-remove";

      remove.innerHTML = `
        <i class="fas fa-xmark text-[9px]"></i>
      `;

      remove.addEventListener(
        "click",
        () => {
          URL.revokeObjectURL(
            item.preview
          );

          selectedImages.splice(
            index,
            1
          );

          renderImagePreviews();
        }
      );

      wrapper.appendChild(
        image
      );

      wrapper.appendChild(
        remove
      );

      grid.appendChild(
        wrapper
      );
    }
  );
}


function handleImageSelection(
  files
) {
  const incoming =
    Array.from(
      files || []
    );

  if (!incoming.length) {
    return;
  }

  if (
    selectedImages.length +
      incoming.length >
    8
  ) {
    toast(
      "You can attach up to 8 images per post.",
      "error"
    );

    return;
  }

  try {
    incoming.forEach(
      file => {
        validateImage(file);

        selectedImages.push({
          file,
          preview:
            URL.createObjectURL(
              file
            )
        });
      }
    );

    renderImagePreviews();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}


/* ============================================================
   GEOLOCATION
============================================================ */

async function reverseGeocode(
  latitude,
  longitude
) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1`;

    const response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              "application/json"
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        "Location lookup failed."
      );
    }

    const data =
      await response.json();

    return (
      data.display_name ||
      null
    );
  } catch (error) {
    console.warn(
      "Reverse geocoding unavailable:",
      error
    );

    return null;
  }
}


async function requestLiveLocation() {
  if (
    !navigator.geolocation
  ) {
    throw new Error(
      "Location services are not supported by this browser."
    );
  }

  return new Promise(
    (resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        async position => {
          const latitude =
            Number(
              position.coords.latitude.toFixed(
                6
              )
            );

          const longitude =
            Number(
              position.coords.longitude.toFixed(
                6
              )
            );

          const accuracy =
            Math.round(
              position.coords
                .accuracy || 0
            );

          const label =
            await reverseGeocode(
              latitude,
              longitude
            );

          const location = {
            latitude,
            longitude,
            accuracy,
            label:
              label ||
              `${latitude}, ${longitude}`,
            capturedAt:
              new Date().toISOString()
          };

          userLocation =
            location;

          resolve(location);
        },
        error => {
          let message =
            "Unable to determine your location.";

          if (
            error.code ===
            error.PERMISSION_DENIED
          ) {
            message =
              "Location permission was denied.";
          }

          if (
            error.code ===
            error.POSITION_UNAVAILABLE
          ) {
            message =
              "Your location is currently unavailable.";
          }

          if (
            error.code ===
            error.TIMEOUT
          ) {
            message =
              "Location request timed out.";
          }

          reject(
            new Error(message)
          );
        },
        {
          enableHighAccuracy:
            true,
          timeout: 15000,
          maximumAge:
            60000
        }
      );
    }
  );
}


async function handleLocationToggle() {
  const checkbox =
    $("attachLocation");

  if (!checkbox) {
    return;
  }

  if (!checkbox.checked) {
    userLocation = null;

    if ($("locationStatus")) {
      $("locationStatus")
        .textContent =
        "Your location will only be requested when you enable this.";
    }

    return;
  }

  if ($("locationStatus")) {
    $("locationStatus")
      .textContent =
      "Requesting your current location...";
  }

  try {
    const location =
      await requestLiveLocation();

    if ($("locationStatus")) {
      $("locationStatus")
        .textContent =
        `${location.label} · ±${location.accuracy}m`;
    }
  } catch (error) {
    checkbox.checked =
      false;

    if ($("locationStatus")) {
      $("locationStatus")
        .textContent =
        "Location could not be attached.";
    }

    toast(
      error.message,
      "error"
    );
  }
}


/* ============================================================
   COMPOSER
============================================================ */

function openComposer(
  type = "discussion"
) {
  selectedPostType =
    type;

  document
    .querySelectorAll(
      ".post-type-option"
    )
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset
          .postType === type
      );
    });

  updateComposerFields();

  $("composerModal")
    ?.classList.add(
      "open"
    );

  document.body.classList.add(
    "modal-open"
  );

  setTimeout(
    () => {
      if (
        type === "question" ||
        type === "discussion"
      ) {
        $("postTitle")
          ?.focus();
      } else {
        $("postContent")
          ?.focus();
      }
    },
    80
  );
}


function closeComposer() {
  $("composerModal")
    ?.classList.remove(
      "open"
    );

  document.body.classList.remove(
    "modal-open"
  );
}


function resetComposer() {
  $("postForm")?.reset();

  if ($("postTitle")) {
    $("postTitle").value =
      "";
  }

  if ($("postContent")) {
    $("postContent").value =
      "";
  }

  if ($("characterCount")) {
    $("characterCount")
      .textContent =
      "0 / 5000";
  }

  selectedImages.forEach(
    item => {
      URL.revokeObjectURL(
        item.preview
      );
    }
  );

  selectedImages = [];

  renderImagePreviews();

  userLocation =
    null;

  if ($("locationStatus")) {
    $("locationStatus")
      .textContent =
      "Your location will only be requested when you enable this.";
  }

  selectedPostType =
    "discussion";

  document
    .querySelectorAll(
      ".post-type-option"
    )
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset
          .postType ===
          "discussion"
      );
    });

  updateComposerFields();
}


function updateComposerFields() {
  const titleRequired =
    selectedPostType ===
      "discussion" ||
    selectedPostType ===
      "question" ||
    selectedPostType ===
      "property";

  $("titleField")
    ?.classList.toggle(
      "hidden",
      !titleRequired
    );

  if ($("postTitle")) {
    $("postTitle").required =
      titleRequired;
  }

  $("propertyField")
    ?.classList.toggle(
      "show",
      selectedPostType ===
        "property"
    );

  if (
    selectedPostType ===
    "property"
  ) {
    if (!properties.length) {
      const select =
        $("propertyField")
          ?.querySelector(
            "select"
          );

      if (select) {
        select.innerHTML = `
          <option value="">
            You have no properties available
          </option>
        `;
      }
    } else {
      populatePropertySelector();
    }
  }
}


/* ============================================================
   POST CREATION
============================================================ */

async function createPost(
  event
) {
  event.preventDefault();

  if (!currentUser) {
    toast(
      "Your session is no longer active.",
      "error"
    );

    return;
  }

  if (!isOnline()) {
    toast(
      "You are offline. Please reconnect before publishing.",
      "error"
    );

    return;
  }

  const content =
    $("postContent")
      ?.value.trim() ||
    "";

  const title =
    $("postTitle")
      ?.value.trim() ||
    "";

  if (!content) {
    toast(
      "Write something before publishing.",
      "error"
    );

    $("postContent")
      ?.focus();

    return;
  }

  const titleRequired =
    selectedPostType ===
      "discussion" ||
    selectedPostType ===
      "question" ||
    selectedPostType ===
      "property";

  if (
    titleRequired &&
    !title
  ) {
    toast(
      "Add a title to your post.",
      "error"
    );

    $("postTitle")
      ?.focus();

    return;
  }

  const selectedProperty =
    getSelectedProperty();

  if (
    selectedPostType ===
      "property" &&
    !selectedProperty
  ) {
    toast(
      "Choose one of your properties.",
      "error"
    );

    return;
  }

  const publishButton =
    $("publishPost");

  setButtonLoading(
    publishButton,
    true,
    "Publishing"
  );

  try {
    let locationData =
      null;

    if (
      $("attachLocation")
        ?.checked
    ) {
      locationData =
        userLocation ||
        await requestLiveLocation();
    }

    const uploadedImages =
      [];

    for (
      let index = 0;
      index <
      selectedImages.length;
      index++
    ) {
      const item =
        selectedImages[index];

      toast(
        `Uploading image ${index + 1} of ${selectedImages.length}...`,
        "info"
      );

      const result =
        await uploadImage(
          item.file
        );

      uploadedImages.push({
        url:
          result.secure_url,
        publicId:
          result.public_id,
        width:
          result.width ||
          null,
        height:
          result.height ||
          null,
        format:
          result.format ||
          item.file.type,
        size:
          item.file.size,
        filename:
          item.file.name
      });
    }

    const propertySnapshot =
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
              selectedProperty
                .images?.[0] ||
              ""
          }
        : null;

    const postPayload = {
      type:
        selectedPostType,

      title,

      content,

      authorId:
        currentUser.uid,

      authorName:
        displayName(),

      authorRole:
        displayRole(),

      authorPhotoURL:
        avatarURL(
          currentProfile
        ) ||
        currentUser.photoURL ||
        "",

      imageCount:
        uploadedImages.length,

      images:
        uploadedImages,

      likeCount: 0,

      commentCount: 0,

      shareCount: 0,

      saveCount: 0,

      isQuestion:
        selectedPostType ===
        "question",

      answered: false,

      location:
        locationData,

      propertyId:
        selectedProperty?.id ||
        null,

      propertySnapshot,

      moderationStatus:
        "published",

      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp()
    };

    await addDoc(
      collection(
        db,
        "communityPosts"
      ),
      postPayload
    );

    if (
      locationData &&
      $("sidebarLocationText")
    ) {
      $("sidebarLocationText")
        .textContent =
        locationData.label;
    }

    resetComposer();

    closeComposer();

    toast(
      "Your post is now live."
    );

    $("communityFeed")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  } catch (error) {
    console.error(
      "Create post error:",
      error
    );

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
   FEED NORMALIZATION
============================================================ */

function normalizeCommunityPost(
  docSnap
) {
  const data =
    docSnap.data() ||
    {};

  return {
    id:
      docSnap.id,

    ...data,

    type:
      data.type ||
      "discussion",

    title:
      typeof data.title ===
      "string"
        ? data.title
        : "",

    content:
      typeof data.content ===
      "string"
        ? data.content
        : "",

    authorId:
      data.authorId ||
      "",

    authorName:
      data.authorName ||
      "Community member",

    authorRole:
      data.authorRole ||
      "client",

    likeCount:
      Number.isFinite(
        Number(
          data.likeCount
        )
      )
        ? Number(
            data.likeCount
          )
        : 0,

    commentCount:
      Number.isFinite(
        Number(
          data.commentCount
        )
      )
        ? Number(
            data.commentCount
          )
        : 0,

    shareCount:
      Number.isFinite(
        Number(
          data.shareCount
        )
      )
        ? Number(
            data.shareCount
          )
        : 0,

    saveCount:
      Number.isFinite(
        Number(
          data.saveCount
        )
      )
        ? Number(
            data.saveCount
          )
        : 0,

    images:
      Array.isArray(
        data.images
      )
        ? data.images
        : []
  };
}


function decoratePostState(
  post
) {
  return {
    ...post,

    currentUserLiked:
      likedPostIds.has(
        post.id
      ),

    currentUserSaved:
      savedPostIds.has(
        post.id
      )
  };
}


function sortCommunityPosts(
  posts
) {
  return [...posts].sort(
    (a, b) =>
      timestampMillis(
        b.createdAt
      ) -
      timestampMillis(
        a.createdAt
      )
  );
}


/* ============================================================
   REACTION STATE
============================================================ */

async function loadReactionState() {
  likedPostIds.clear();
  savedPostIds.clear();

  if (!currentUser) {
    return;
  }

  const visiblePosts =
    allPosts.slice(
      0,
      100
    );

  /*
   * These reads are intentionally isolated. A missing reaction
   * document simply means the user has not reacted.
   */
  await Promise.all(
    visiblePosts.map(
      async post => {
        try {
          const reactionRef =
            doc(
              db,
              "communityPosts",
              post.id,
              "reactions",
              currentUser.uid
            );

          const reactionSnap =
            await getDoc(
              reactionRef
            );

          if (
            reactionSnap.exists()
          ) {
            likedPostIds.add(
              post.id
            );
          }
        } catch (error) {
          console.warn(
            `Could not load reaction for ${post.id}:`,
            error
          );
        }

        try {
          const savedRef =
            doc(
              db,
              "users",
              currentUser.uid,
              "savedPosts",
              post.id
            );

          const savedSnap =
            await getDoc(
              savedRef
            );

          if (
            savedSnap.exists()
          ) {
            savedPostIds.add(
              post.id
            );
          }
        } catch (error) {
          console.warn(
            `Could not load saved state for ${post.id}:`,
            error
          );
        }
      }
    )
  );
}


async function refreshReactionStateAndRender() {
  await loadReactionState();

  applyFeedFilters();
}


/* ============================================================
   FEED ERROR HANDLING
============================================================ */

function getFeedErrorMessage(
  error
) {
  const code =
    String(
      error?.code || ""
    ).replace(
      /^firestore\//,
      ""
    );

  if (
    code ===
    "permission-denied"
  ) {
    return {
      title:
        "Community access is restricted",

      text:
        "MoonLat could not read the community feed with the current account. Check the deployed Firestore communityPosts read rule and make sure the session is authenticated.",

      action:
        "Retry"
    };
  }

  if (
    code ===
    "failed-precondition"
  ) {
    return {
      title:
        "Community feed needs a database index",

      text:
        "The preferred live feed query requires a Firestore index. MoonLat will use a client-side ordering fallback.",

      action:
        "Retry"
    };
  }

  if (
    code ===
    "unauthenticated"
  ) {
    return {
      title:
        "Your session has expired",

      text:
        "Sign in again to reconnect to the MoonLat community.",

      action:
        "Sign in"
    };
  }

  if (
    code ===
      "unavailable" ||
    !navigator.onLine
  ) {
    return {
      title:
        "Connection interrupted",

      text:
        "MoonLat could not reach the live community feed. Your connection may be temporarily unavailable.",

      action:
        "Retry"
    };
  }

  return {
    title:
      "Community feed unavailable",

    text:
      "MoonLat could not load the live community feed.",

    action:
      "Retry"
  };
}


function renderFeedError(
  error
) {
  const state =
    getFeedErrorMessage(
      error
    );

  const feed =
    $("communityFeed");

  if (!feed) {
    return;
  }

  feed.innerHTML = `
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

  $("retryFeed")
    ?.addEventListener(
      "click",
      () => {
        if (
          state.action ===
          "Sign in"
        ) {
          window.location.href =
            "../dashboard/sign-in.html";

          return;
        }

        subscribeToFeed();
      }
    );
}


function attachFeedSnapshot(
  queryRef,
  allowFallback = true
) {
  feedUnsubscribe =
    onSnapshot(
      queryRef,
      async snapshot => {
        allPosts =
          sortCommunityPosts(
            snapshot.docs.map(
              normalizeCommunityPost
            )
          );

        updateCommunityMetrics();

        /*
         * Render immediately using existing local reaction state.
         */
        applyFeedFilters();

        /*
         * Hydrate persistent reaction state.
         */
        await refreshReactionStateAndRender();

        handleDeepLink();
      },
      error => {
        console.error(
          "Feed subscription error:",
          error
        );

        const code =
          String(
            error?.code || ""
          ).replace(
            /^firestore\//,
            ""
          );

        if (
          code ===
            "failed-precondition" &&
          allowFallback
        ) {
          if (
            feedUnsubscribe
          ) {
            feedUnsubscribe();
            feedUnsubscribe =
              null;
          }

          const fallbackQuery =
            query(
              collection(
                db,
                "communityPosts"
              ),
              limit(100)
            );

          attachFeedSnapshot(
            fallbackQuery,
            false
          );

          return;
        }

        renderFeedError(
          error
        );
      }
    );
}


function subscribeToFeed() {
  if (!currentUser) {
    return;
  }

  if (feedUnsubscribe) {
    feedUnsubscribe();

    feedUnsubscribe =
      null;
  }

  const feedQuery =
    query(
      collection(
        db,
        "communityPosts"
      ),
      orderBy(
        "createdAt",
        "desc"
      ),
      limit(100)
    );

  attachFeedSnapshot(
    feedQuery
  );
}


/* ============================================================
   FILTERING
============================================================ */

function applyFeedFilters() {
  let result =
    allPosts.map(
      decoratePostState
    );

  if (
    activeCategory !==
    "all"
  ) {
    result =
      result.filter(
        post =>
          post.type ===
          activeCategory
      );
  }

  if (searchTerm) {
    const search =
      searchTerm.toLowerCase();

    result =
      result.filter(
        post => {
          const haystack = [
            post.title,
            post.content,
            post.authorName,
            post.authorRole,
            post.propertySnapshot
              ?.title,
            post.propertySnapshot
              ?.address,
            post.location
              ?.label
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(
            search
          );
        }
      );
  }

  if (
    nearbyMode &&
    userLocation
  ) {
    result =
      result.filter(
        post => {
          if (
            !post.location
          ) {
            return false;
          }

          const distance =
            calculateDistanceKm(
              userLocation.latitude,
              userLocation.longitude,
              Number(
                post.location
                  .latitude
              ),
              Number(
                post.location
                  .longitude
              )
            );

          return (
            Number.isFinite(
              distance
            ) &&
            distance <= 25
          );
        }
      );
  }

  if (
    activeSort ===
    "popular"
  ) {
    result.sort(
      (a, b) => {
        const scoreA =
          (a.likeCount ||
            0) +
          (a.commentCount ||
            0) *
            2 +
          (a.shareCount ||
            0) *
            2;

        const scoreB =
          (b.likeCount ||
            0) +
          (b.commentCount ||
            0) *
            2 +
          (b.shareCount ||
            0) *
            2;

        return (
          scoreB -
          scoreA
        );
      }
    );
  }

  if (
    activeSort ===
    "unanswered"
  ) {
    result =
      result.filter(
        post =>
          post.type ===
            "question" &&
          !post.answered
      );
  }

  filteredPosts =
    result;

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
  const values = [
    lat1,
    lon1,
    lat2,
    lon2
  ].map(Number);

  if (
    values.some(
      value =>
        !Number.isFinite(
          value
        )
    )
  ) {
    return Infinity;
  }

  const [
    aLat,
    aLon,
    bLat,
    bLon
  ] = values;

  const R =
    6371;

  const dLat =
    (bLat - aLat) *
    Math.PI /
    180;

  const dLon =
    (bLon - aLon) *
    Math.PI /
    180;

  const a =
    Math.sin(
      dLat / 2
    ) ** 2 +
    Math.cos(
      aLat *
        Math.PI /
        180
    ) *
      Math.cos(
        bLat *
          Math.PI /
          180
      ) *
      Math.sin(
        dLon / 2
      ) ** 2;

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
  const feed =
    $("communityFeed");

  if (!feed) {
    return;
  }

  if ($("feedCount")) {
    $("feedCount")
      .textContent =
      `${filteredPosts.length} ${
        filteredPosts.length === 1
          ? "post"
          : "posts"
      }`;
  }

  if (!filteredPosts.length) {
    const nearbyText =
      nearbyMode
        ? "No posts with live location were found within 25km of your current location."
        : searchTerm
          ? "Try a different search phrase or remove the current filters."
          : activeCategory ===
              "question"
            ? "There are no questions here yet. Start the first one."
            : "This part of the community is quiet right now. Start the conversation.";

    feed.innerHTML = `
      <div class="feed-state">
        <div class="feed-state-icon">
          <i class="fas ${
            nearbyMode
              ? "fa-location-dot"
              : "fa-comments"
          }"></i>
        </div>

        <div class="feed-state-title">
          ${
            nearbyMode
              ? "Nothing nearby yet"
              : "Nothing here yet"
          }
        </div>

        <div class="feed-state-text">
          ${escapeHTML(
            nearbyText
          )}
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

    $("emptyCreatePost")
      ?.addEventListener(
        "click",
        () =>
          openComposer(
            "discussion"
          )
      );

    return;
  }

  feed.innerHTML =
    filteredPosts
      .map(renderPost)
      .join("");

  bindPostActions();
}


/* ============================================================
   POST RENDER
============================================================ */

function renderPost(
  post
) {
  const avatar =
    post.authorPhotoURL ||
    "";

  const authorInitials =
    getInitials(
      post.authorName ||
        "User"
    );

  const role =
    String(
      post.authorRole ||
        "client"
    ).toLowerCase();

  const roleClass =
    role === "agent" ||
    role === "admin" ||
    role === "moderator"
      ? "role-agent"
      : "role-client";

  const liked =
    Boolean(
      post.currentUserLiked
    );

  const saved =
    Boolean(
      post.currentUserSaved
    );

  const typeLabel =
    getPostTypeLabel(
      post.type
    );

  const typeIcon =
    getPostTypeIcon(
      post.type
    );

  let locationHTML =
    "";

  if (post.location) {
    const locationLabel =
      post.location.label ||
      `${post.location.latitude}, ${post.location.longitude}`;

    locationHTML = `
      <div class="post-location">
        <i class="fas fa-location-dot text-[9px]"></i>
        <span>
          ${escapeHTML(
            locationLabel
          )}
        </span>
      </div>
    `;
  }

  let propertyHTML =
    "";

  if (
    post.propertyId &&
    post.propertySnapshot
  ) {
    const property =
      post.propertySnapshot;

    propertyHTML = `
      <div
        class="property-share"
        data-property-id="${escapeHTML(
          post.propertyId
        )}"
        role="button"
        tabindex="0"
      >
        ${
          property.image
            ? `
              <div class="property-share-image">
                <img
                  src="${escapeHTML(
                    property.image
                  )}"
                  alt="${escapeHTML(
                    property.title ||
                      "Property"
                  )}"
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
                  ${escapeHTML(
                    String(
                      property.price
                    )
                  )}
                </div>
              `
              : ""
          }

          <div class="property-share-title">
            ${escapeHTML(
              property.title ||
                "Property"
            )}
          </div>

          ${
            property.address
              ? `
                <div class="property-share-location">
                  <i class="fas fa-location-dot"></i>
                  ${escapeHTML(
                    property.address
                  )}
                </div>
              `
              : ""
          }

        </div>
      </div>
    `;
  }

  const images =
    Array.isArray(
      post.images
    )
      ? post.images.filter(
          image =>
            image?.url
        )
      : [];

  let imagesHTML =
    "";

  if (images.length) {
    const layout =
      images.length === 1
        ? "single"
        : images.length === 2
          ? "two"
          : images.length === 3
            ? "three"
            : "multi";

    const visibleImages =
      images.slice(
        0,
        4
      );

    imagesHTML = `
      <div class="post-images ${layout}">
        ${visibleImages
          .map(
            (
              image,
              index
            ) => {
              const remaining =
                images.length -
                4;

              return `
                <button
                  class="post-image"
                  type="button"
                  data-image-url="${escapeHTML(
                    image.url
                  )}"
                  aria-label="Open image"
                >
                  <img
                    src="${escapeHTML(
                      image.url
                    )}"
                    alt="${escapeHTML(
                      image.filename ||
                        "Community image"
                    )}"
                    loading="lazy"
                  >

                  ${
                    index ===
                      3 &&
                    remaining > 0
                      ? `
                        <div class="more-images">
                          +${remaining}
                        </div>
                      `
                      : ""
                  }
                </button>
              `;
            }
          )
          .join("")}
      </div>
    `;
  }

  return `
    <article
      class="post-card"
      data-post-id="${escapeHTML(
        post.id
      )}"
    >

      <div class="post-body">

        <div class="post-header">

          <div class="user-avatar">

            ${
              avatar
                ? `
                  <img
                    src="${escapeHTML(
                      avatar
                    )}"
                    alt="${escapeHTML(
                      post.authorName ||
                        "User"
                    )}"
                    loading="lazy"
                  >
                `
                : escapeHTML(
                    authorInitials
                  )
            }

          </div>

          <div class="post-author">

            <div class="post-author-line">

              <span class="post-author-name">
                ${escapeHTML(
                  post.authorName ||
                    "Community member"
                )}
              </span>

              <span class="role-badge ${roleClass}">
                ${escapeHTML(
                  role
                )}
              </span>

            </div>

            <div class="post-time">
              ${formatRelativeTime(
                post.createdAt
              )}
            </div>

          </div>

          <button
            class="post-menu"
            type="button"
            data-action="menu"
            data-post-id="${escapeHTML(
              post.id
            )}"
            aria-label="Post options"
          >
            <i class="fas fa-ellipsis"></i>
          </button>

        </div>

        <div class="post-type">
          <i class="fas ${typeIcon}"></i>
          ${escapeHTML(
            typeLabel
          )}
        </div>

        ${
          post.title
            ? `
              <h2 class="post-title">
                ${escapeHTML(
                  post.title
                )}
              </h2>
            `
            : ""
        }

        ${
          post.content
            ? `
              <div class="post-content">
                ${escapeHTML(
                  post.content
                )}
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
              class="post-action ${
                liked
                  ? "liked"
                  : ""
              }"
              type="button"
              data-action="like"
              data-post-id="${escapeHTML(
                post.id
              )}"
              aria-pressed="${
                liked
                  ? "true"
                  : "false"
              }"
              aria-label="${
                liked
                  ? "Unlike post"
                  : "Like post"
              }"
            >
              <i class="${
                liked
                  ? "fas"
                  : "far"
              } fa-heart"></i>

              <span>
                ${formatNumber(
                  post.likeCount ||
                    0
                )}
              </span>
            </button>

            <button
              class="post-action"
              type="button"
              data-action="comment"
              data-post-id="${escapeHTML(
                post.id
              )}"
              aria-label="Open comments"
            >
              <i class="far fa-comment"></i>

              <span>
                ${formatNumber(
                  post.commentCount ||
                    0
                )}
              </span>
            </button>

            <button
              class="post-action"
              type="button"
              data-action="share"
              data-post-id="${escapeHTML(
                post.id
              )}"
              aria-label="Share post"
            >
              <i class="fas fa-share"></i>

              <span>
                ${formatNumber(
                  post.shareCount ||
                    0
                )}
              </span>
            </button>

          </div>

          <button
            class="post-action ${
              saved
                ? "saved"
                : ""
            }"
            type="button"
            data-action="save"
            data-post-id="${escapeHTML(
              post.id
            )}"
            aria-label="${
              saved
                ? "Unsave post"
                : "Save post"
            }"
            aria-pressed="${
              saved
                ? "true"
                : "false"
            }"
          >
            <i class="${
              saved
                ? "fas"
                : "far"
            } fa-bookmark"></i>
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
    .querySelectorAll(
      "[data-action]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        async event => {
          event.stopPropagation();

          const action =
            button.dataset.action;

          const postId =
            button.dataset.postId;

          if (!postId) {
            return;
          }

          if (
            action ===
            "like"
          ) {
            await toggleLike(
              postId
            );

            return;
          }

          if (
            action ===
            "comment"
          ) {
            openComments(
              postId
            );

            return;
          }

          if (
            action ===
            "share"
          ) {
            await sharePost(
              postId
            );

            return;
          }

          if (
            action ===
            "save"
          ) {
            await toggleSave(
              postId
            );

            return;
          }

          if (
            action ===
            "menu"
          ) {
            openPostMenu(
              postId
            );
          }
        }
      );
    });

  document
    .querySelectorAll(
      "[data-image-url]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          openImageViewer(
            button.dataset
              .imageUrl
          );
        }
      );
    });

  document
    .querySelectorAll(
      ".property-share"
    )
    .forEach(element => {
      const open =
        () => {
          const propertyId =
            element.dataset
              .propertyId;

          if (!propertyId) {
            return;
          }

          window.location.href =
            `property.html?id=${encodeURIComponent(propertyId)}`;
        };

      element.addEventListener(
        "click",
        event => {
          event.stopPropagation();
          open();
        }
      );

      element.addEventListener(
        "keydown",
        event => {
          if (
            event.key ===
              "Enter" ||
            event.key ===
              " "
          ) {
            event.preventDefault();
            open();
          }
        }
      );
    });
}


/* ============================================================
   LIKE
============================================================ */

async function toggleLike(
  postId
) {
  if (!currentUser) {
    toast(
      "Please sign in to react to posts.",
      "error"
    );

    return;
  }

  if (!isOnline()) {
    toast(
      "You are offline.",
      "error"
    );

    return;
  }

  const key =
    actionKey(
      "like",
      postId
    );

  if (!beginAction(key)) {
    return;
  }

  const wasLiked =
    likedPostIds.has(
      postId
    );

  const post =
    allPosts.find(
      item =>
        item.id ===
        postId
    );

  const previousCount =
    Number(
      post?.likeCount ||
        0
    );

  /*
   * Optimistic UI.
   */
  const optimisticLiked =
    !wasLiked;

  const optimisticCount =
    Math.max(
      0,
      previousCount +
        (
          optimisticLiked
            ? 1
            : -1
        )
    );

  if (optimisticLiked) {
    likedPostIds.add(
      postId
    );
  } else {
    likedPostIds.delete(
      postId
    );
  }

  if (post) {
    post.likeCount =
      optimisticCount;
  }

  applyFeedFilters();

  try {
    const reactionRef =
      doc(
        db,
        "communityPosts",
        postId,
        "reactions",
        currentUser.uid
      );

    const postRef =
      doc(
        db,
        "communityPosts",
        postId
      );

    const result =
      await runTransaction(
        db,
        async transaction => {
          const reactionSnap =
            await transaction.get(
              reactionRef
            );

          const postSnap =
            await transaction.get(
              postRef
            );

          if (
            !postSnap.exists()
          ) {
            throw new Error(
              "This post no longer exists."
            );
          }

          const serverLiked =
            reactionSnap.exists();

          /*
           * Reconcile the transaction against the actual server
           * state rather than blindly incrementing.
           */
          if (
            optimisticLiked &&
            !serverLiked
          ) {
            transaction.set(
              reactionRef,
              {
                userId:
                  currentUser.uid,

                createdAt:
                  serverTimestamp()
              }
            );

            transaction.update(
              postRef,
              {
                likeCount:
                  increment(
                    1
                  ),

                updatedAt:
                  serverTimestamp()
              }
            );

            return {
              liked: true,
              changed: true
            };
          }

          if (
            !optimisticLiked &&
            serverLiked
          ) {
            transaction.delete(
              reactionRef
            );

            transaction.update(
              postRef,
              {
                likeCount:
                  increment(
                    -1
                  ),

                updatedAt:
                  serverTimestamp()
              }
            );

            return {
              liked: false,
              changed: true
            };
          }

          return {
            liked:
              serverLiked,

            changed:
              false
          };
        }
      );

    /*
     * Server reconciliation.
     */
    if (result.liked) {
      likedPostIds.add(
        postId
      );
    } else {
      likedPostIds.delete(
        postId
      );
    }

    if (
      post &&
      !result.changed
    ) {
      /*
       * We do not know the exact server aggregate without
       * another read, so leave Firestore snapshot as the eventual
       * source of truth.
       */
    }

    applyFeedFilters();

    if (
      result.liked &&
      post?.authorId &&
      post.authorId !==
        currentUser.uid
    ) {
      await createNotificationOnce(
        `like:${postId}:${currentUser.uid}`,
        {
          userId:
            post.authorId,

          type:
            "like",

          postId,

          actorId:
            currentUser.uid,

          actorName:
            displayName(),

          message:
            `${displayName()} liked your post.`,

          read:
            false,

          createdAt:
            serverTimestamp()
        }
      );
    }
  } catch (error) {
    console.error(
      "Like error:",
      error
    );

    /*
     * Roll back optimistic UI.
     */
    if (wasLiked) {
      likedPostIds.add(
        postId
      );
    } else {
      likedPostIds.delete(
        postId
      );
    }

    if (post) {
      post.likeCount =
        previousCount;
    }

    applyFeedFilters();

    toast(
      error?.message ||
        "Could not update reaction.",
      "error"
    );
  } finally {
    endAction(key);
  }
}


/* ============================================================
   SAVE
============================================================ */

async function toggleSave(
  postId
) {
  if (!currentUser) {
    toast(
      "Please sign in to save posts.",
      "error"
    );

    return;
  }

  if (!isOnline()) {
    toast(
      "You are offline.",
      "error"
    );

    return;
  }

  const key =
    actionKey(
      "save",
      postId
    );

  if (!beginAction(key)) {
    return;
  }

  const wasSaved =
    savedPostIds.has(
      postId
    );

  const post =
    allPosts.find(
      item =>
        item.id ===
        postId
    );

  const previousCount =
    Number(
      post?.saveCount ||
        0
    );

  const nextSaved =
    !wasSaved;

  const nextCount =
    Math.max(
      0,
      previousCount +
        (
          nextSaved
            ? 1
            : -1
        )
    );

  if (nextSaved) {
    savedPostIds.add(
      postId
    );
  } else {
    savedPostIds.delete(
      postId
    );
  }

  if (post) {
    post.saveCount =
      nextCount;
  }

  applyFeedFilters();

  try {
    const savedRef =
      doc(
        db,
        "users",
        currentUser.uid,
        "savedPosts",
        postId
      );

    const postRef =
      doc(
        db,
        "communityPosts",
        postId
      );

    await runTransaction(
      db,
      async transaction => {
        const savedSnap =
          await transaction.get(
            savedRef
          );

        const postSnap =
          await transaction.get(
            postRef
          );

        if (
          !postSnap.exists()
        ) {
          throw new Error(
            "This post no longer exists."
          );
        }

        const serverSaved =
          savedSnap.exists();

        if (
          nextSaved &&
          !serverSaved
        ) {
          transaction.set(
            savedRef,
            {
              postId,

              userId:
                currentUser.uid,

              savedAt:
                serverTimestamp()
            }
          );

          transaction.update(
            postRef,
            {
              saveCount:
                increment(
                  1
                ),

              updatedAt:
                serverTimestamp()
            }
          );

          return;
        }

        if (
          !nextSaved &&
          serverSaved
        ) {
          transaction.delete(
            savedRef
          );

          transaction.update(
            postRef,
            {
              saveCount:
                increment(
                  -1
                ),

              updatedAt:
                serverTimestamp()
            }
          );
        }
      }
    );

    toast(
      nextSaved
        ? "Post saved."
        : "Removed from saved posts.",
      "info"
    );
  } catch (error) {
    console.error(
      "Save error:",
      error
    );

    if (wasSaved) {
      savedPostIds.add(
        postId
      );
    } else {
      savedPostIds.delete(
        postId
      );
    }

    if (post) {
      post.saveCount =
        previousCount;
    }

    applyFeedFilters();

    toast(
      "Could not update saved posts.",
      "error"
    );
  } finally {
    endAction(key);
  }
}


/* ============================================================
   SHARE
============================================================ */

async function sharePost(
  postId
) {
  if (!currentUser) {
    toast(
      "Please sign in to share posts.",
      "error"
    );

    return;
  }

  const key =
    actionKey(
      "share",
      postId
    );

  if (!beginAction(key)) {
    return;
  }

  const url =
    `${window.location.origin}${window.location.pathname}?post=${encodeURIComponent(postId)}`;

  try {
    let shared =
      false;

    if (
      navigator.share
    ) {
      try {
        await navigator.share({
          title:
            "MoonLat Community",

          text:
            "View this community post on MoonLat.",

          url
        });

        shared =
          true;
      } catch (error) {
        if (
          error?.name ===
          "AbortError"
        ) {
          return;
        }

        console.warn(
          "Native share unavailable:",
          error
        );
      }
    }

    if (!shared) {
      if (
        !navigator
          .clipboard
          ?.writeText
      ) {
        throw new Error(
          "Sharing is not supported by this browser."
        );
      }

      await navigator.clipboard.writeText(
        url
      );

      toast(
        "Community link copied."
      );
    }

    /*
     * Only count a share after the user actually completed
     * the native share or the fallback copy.
     */
    await updateDoc(
      doc(
        db,
        "communityPosts",
        postId
      ),
      {
        shareCount:
          increment(1),

        updatedAt:
          serverTimestamp()
      }
    );

    const post =
      allPosts.find(
        item =>
          item.id ===
          postId
      );

    if (post) {
      post.shareCount =
        Number(
          post.shareCount ||
            0
        ) + 1;

      applyFeedFilters();
    }
  } catch (error) {
    console.error(
      "Share error:",
      error
    );

    toast(
      error?.message ||
        "Could not share this post.",
      "error"
    );
  } finally {
    endAction(key);
  }
}


/* ============================================================
   POST MENU / MODERATION
============================================================ */

async function openPostMenu(
  postId
) {
  const post =
    allPosts.find(
      item =>
        item.id ===
        postId
    );

  if (
    !post ||
    !currentUser
  ) {
    return;
  }

  const role =
    displayRole();

  const isOwner =
    post.authorId ===
    currentUser.uid;

  const isAdmin =
    role === "admin" ||
    role === "moderator";

  if (isOwner) {
    const choice =
      window.prompt(
        "Type DELETE to permanently delete this post."
      );

    if (
      choice !==
      "DELETE"
    ) {
      return;
    }

    try {
      await deleteDoc(
        doc(
          db,
          "communityPosts",
          postId
        )
      );

      toast(
        "Post deleted."
      );
    } catch (error) {
      console.error(
        "Delete post error:",
        error
      );

      toast(
        "Could not delete the post.",
        "error"
      );
    }

    return;
  }

  if (isAdmin) {
    const action =
      window.prompt(
        "Moderator action: type DELETE to remove this post or REPORT to open a moderation report."
      );

    if (
      action ===
      "DELETE"
    ) {
      try {
        await updateDoc(
          doc(
            db,
            "communityPosts",
            postId
          ),
          {
            moderationStatus:
              "removed",

            moderatedBy:
              currentUser.uid,

            moderatedAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()
          }
        );

        toast(
          "Post removed from the community."
        );
      } catch (error) {
        console.error(
          "Moderation delete error:",
          error
        );

        toast(
          "Could not remove this post.",
          "error"
        );
      }

      return;
    }

    if (
      action !==
      "REPORT"
    ) {
      return;
    }
  }

  currentReportPostId =
    postId;

  $("reportModal")
    ?.classList.add(
      "open"
    );

  document.body.classList.add(
    "modal-open"
  );
}


/* ============================================================
   REPORT
============================================================ */

async function submitReport(
  event
) {
  event.preventDefault();

  if (
    !currentReportPostId ||
    !currentUser
  ) {
    return;
  }

  const reason =
    $("reportReason")
      ?.value ||
    "";

  const details =
    $("reportDetails")
      ?.value.trim() ||
    "";

  if (!reason) {
    toast(
      "Choose a report reason.",
      "error"
    );

    return;
  }

  const button =
    $("reportForm")
      ?.querySelector(
        'button[type="submit"]'
      );

  setButtonLoading(
    button,
    true,
    "Submitting"
  );

  try {
    await addDoc(
      collection(
        db,
        "communityReports"
      ),
      {
        postId:
          currentReportPostId,

        reporterId:
          currentUser.uid,

        reason,

        details,

        status:
          "open",

        createdAt:
          serverTimestamp()
      }
    );

    $("reportForm")
      ?.reset();

    closeReportModal();

    toast(
      "Report submitted to moderation."
    );
  } catch (error) {
    console.error(
      "Report error:",
      error
    );

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

function openComments(
  postId
) {
  currentCommentsPostId =
    postId;

  const post =
    allPosts.find(
      item =>
        item.id ===
        postId
    );

  if (
    $("commentsPostTitle")
  ) {
    $("commentsPostTitle")
      .textContent =
      post?.title ||
      "Community conversation";
  }

  $("commentsModal")
    ?.classList.add(
      "open"
    );

  document.body.classList.add(
    "modal-open"
  );

  subscribeToComments(
    postId
  );
}


function closeComments() {
  if (
    commentsUnsubscribe
  ) {
    commentsUnsubscribe();

    commentsUnsubscribe =
      null;
  }

  currentCommentsPostId =
    null;

  $("commentsModal")
    ?.classList.remove(
      "open"
    );

  document.body.classList.remove(
    "modal-open"
  );
}


function subscribeToComments(
  postId
) {
  if (
    commentsUnsubscribe
  ) {
    commentsUnsubscribe();
  }

  const q =
    query(
      collection(
        db,
        "communityPosts",
        postId,
        "comments"
      ),
      orderBy(
        "createdAt",
        "asc"
      ),
      limit(100)
    );

  commentsUnsubscribe =
    onSnapshot(
      q,
      snapshot => {
        const comments =
          snapshot.docs.map(
            docSnap => ({
              id:
                docSnap.id,

              ...docSnap.data()
            })
          );

        renderComments(
          comments
        );
      },
      error => {
        console.error(
          "Comments error:",
          error
        );

        const list =
          $("commentList");

        if (list) {
          list.innerHTML = `
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
      }
    );
}


function renderComments(
  comments
) {
  const list =
    $("commentList");

  if (!list) {
    return;
  }

  if (!comments.length) {
    list.innerHTML = `
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

  list.innerHTML =
    comments
      .map(
        comment => {
          const initials =
            getInitials(
              comment.authorName ||
                "User"
            );

          const avatar =
            comment.authorPhotoURL ||
            "";

          const isOwner =
            comment.authorId ===
            currentUser?.uid;

          return `
            <div
              class="comment"
              data-comment-id="${escapeHTML(
                comment.id
              )}"
            >

              <div class="user-avatar !w-8 !h-8 !rounded-[10px] !text-[8px]">

                ${
                  avatar
                    ? `
                      <img
                        src="${escapeHTML(
                          avatar
                        )}"
                        alt="${escapeHTML(
                          comment.authorName ||
                            "User"
                        )}"
                        loading="lazy"
                      >
                    `
                    : escapeHTML(
                        initials
                      )
                }

              </div>

              <div class="comment-content">

                <div class="flex items-start justify-between gap-2">

                  <div class="comment-author">
                    ${escapeHTML(
                      comment.authorName ||
                        "Community member"
                    )}
                  </div>

                  ${
                    isOwner
                      ? `
                        <button
                          class="text-slate-400 hover:text-red-500"
                          type="button"
                          data-delete-comment="${escapeHTML(
                            comment.id
                          )}"
                          aria-label="Delete comment"
                        >
                          <i class="fas fa-trash-can text-[9px]"></i>
                        </button>
                      `
                      : ""
                  }

                </div>

                <div class="comment-text">
                  ${escapeHTML(
                    comment.text ||
                      ""
                  )}
                </div>

                <div class="comment-time">
                  ${formatRelativeTime(
                    comment.createdAt
                  )}
                </div>

              </div>

            </div>
          `;
        }
      )
      .join("");

  list
    .querySelectorAll(
      "[data-delete-comment]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () =>
            deleteComment(
              button.dataset
                .deleteComment
            )
        );
      }
    );
}


/* ============================================================
   COMMENT CREATION
============================================================ */

async function submitComment(
  event
) {
  event.preventDefault();

  if (
    !currentCommentsPostId ||
    !currentUser
  ) {
    return;
  }

  if (!isOnline()) {
    toast(
      "You are offline.",
      "error"
    );

    return;
  }

  const input =
    $("commentInput");

  const text =
    input?.value.trim() ||
    "";

  if (!text) {
    return;
  }

  const postId =
    currentCommentsPostId;

  const actionKeyValue =
    `comment:${postId}`;

  if (
    !beginAction(
      actionKeyValue
    )
  ) {
    return;
  }

  const button =
    $("commentForm")
      ?.querySelector(
        'button[type="submit"]'
      );

  setButtonLoading(
    button,
    true,
    "Sending"
  );

  try {
    const postRef =
      doc(
        db,
        "communityPosts",
        postId
      );

    const commentRef =
      doc(
        collection(
          db,
          "communityPosts",
          postId,
          "comments"
        )
      );

    /*
     * Create the comment and increment the aggregate in the same
     * transaction. This prevents a comment from existing while
     * the parent post counter fails to update.
     */
    await runTransaction(
      db,
      async transaction => {
        const postSnap =
          await transaction.get(
            postRef
          );

        if (
          !postSnap.exists()
        ) {
          throw new Error(
            "This post no longer exists."
          );
        }

        transaction.set(
          commentRef,
          {
            text,

            authorId:
              currentUser.uid,

            authorName:
              displayName(),

            authorPhotoURL:
              avatarURL(
                currentProfile
              ) ||
              currentUser.photoURL ||
              "",

            createdAt:
              serverTimestamp()
          }
        );

        transaction.update(
          postRef,
          {
            commentCount:
              increment(
                1
              ),

            updatedAt:
              serverTimestamp()
          }
        );
      }
    );

    if (input) {
      input.value =
        "";
    }

    const post =
      allPosts.find(
        item =>
          item.id ===
          postId
      );

    if (post) {
      post.commentCount =
        Number(
          post.commentCount ||
            0
        ) + 1;

      applyFeedFilters();
    }

    if (
      post?.authorId &&
      post.authorId !==
        currentUser.uid
    ) {
      await createNotificationOnce(
        `comment:${postId}:${commentRef.id}`,
        {
          userId:
            post.authorId,

          type:
            "comment",

          postId,

          commentId:
            commentRef.id,

          actorId:
            currentUser.uid,

          actorName:
            displayName(),

          message:
            `${displayName()} commented on your post.`,

          read:
            false,

          createdAt:
            serverTimestamp()
        }
      );
    }

    toast(
      "Reply added."
    );
  } catch (error) {
    console.error(
      "Comment error:",
      error
    );

    toast(
      error?.message ||
        "Could not add your reply.",
      "error"
    );
  } finally {
    setButtonLoading(
      button,
      false
    );

    endAction(
      actionKeyValue
    );
  }
}


/* ============================================================
   COMMENT DELETE
============================================================ */

async function deleteComment(
  commentId
) {
  if (
    !currentCommentsPostId ||
    !currentUser ||
    !commentId
  ) {
    return;
  }

  const actionKeyValue =
    `delete-comment:${commentId}`;

  if (
    !beginAction(
      actionKeyValue
    )
  ) {
    return;
  }

  const confirmed =
    window.confirm(
      "Delete this comment?"
    );

  if (!confirmed) {
    endAction(
      actionKeyValue
    );

    return;
  }

  try {
    const commentRef =
      doc(
        db,
        "communityPosts",
        currentCommentsPostId,
        "comments",
        commentId
      );

    const postRef =
      doc(
        db,
        "communityPosts",
        currentCommentsPostId
      );

    await runTransaction(
      db,
      async transaction => {
        const commentSnap =
          await transaction.get(
            commentRef
          );

        const postSnap =
          await transaction.get(
            postRef
          );

        if (
          !commentSnap.exists()
        ) {
          throw new Error(
            "This comment no longer exists."
          );
        }

        if (
          !postSnap.exists()
        ) {
          throw new Error(
            "This post no longer exists."
          );
        }

        const comment =
          commentSnap.data();

        if (
          comment.authorId !==
          currentUser.uid
        ) {
          throw new Error(
            "You can only delete your own comment."
          );
        }

        const post =
          postSnap.data() ||
          {};

        const currentCount =
          Number(
            post.commentCount ||
              0
          );

        transaction.delete(
          commentRef
        );

        transaction.update(
          postRef,
          {
            commentCount:
              Math.max(
                0,
                currentCount -
                  1
              ),

            updatedAt:
              serverTimestamp()
          }
        );
      }
    );

    const post =
      allPosts.find(
        item =>
          item.id ===
          currentCommentsPostId
      );

    if (post) {
      post.commentCount =
        Math.max(
          0,
          Number(
            post.commentCount ||
              0
          ) - 1
        );

      applyFeedFilters();
    }

    toast(
      "Comment deleted.",
      "info"
    );
  } catch (error) {
    console.error(
      "Delete comment error:",
      error
    );

    toast(
      error?.message ||
        "Could not delete the comment.",
      "error"
    );
  } finally {
    endAction(
      actionKeyValue
    );
  }
}


/* ============================================================
   NOTIFICATIONS
============================================================ */

async function createNotificationOnce(
  guardKey,
  payload
) {
  if (
    !payload?.userId ||
    payload.userId ===
      currentUser?.uid
  ) {
    return;
  }

  if (
    notificationGuards.has(
      guardKey
    )
  ) {
    return;
  }

  notificationGuards.add(
    guardKey
  );

  try {
    await addDoc(
      collection(
        db,
        "notifications"
      ),
      payload
    );
  } catch (error) {
    /*
     * Social action remains successful even if notification
     * creation fails.
     */
    notificationGuards.delete(
      guardKey
    );

    console.warn(
      "Notification creation failed:",
      error
    );
  }
}


function subscribeToNotifications() {
  if (!currentUser) {
    return;
  }

  if (
    notificationUnsubscribe
  ) {
    notificationUnsubscribe();
  }

  try {
    const q =
      query(
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
          const hasUnread =
            snapshot.docs.some(
              docSnap =>
                docSnap.data()
                  ?.read !== true
            );

          $("notificationDot")
            ?.classList.toggle(
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
        Array.isArray(
          post.images
        ) &&
        post.images.length
    ).length;

  const questions =
    allPosts.filter(
      post =>
        post.type ===
        "question"
    ).length;

  const propertiesCount =
    allPosts.filter(
      post =>
        post.propertyId
    ).length;

  if (
    $("communityPostCount")
  ) {
    $("communityPostCount")
      .textContent =
      formatNumber(posts);
  }

  if (
    $("communityPhotoCount")
  ) {
    $("communityPhotoCount")
      .textContent =
      formatNumber(
        photos
      );
  }

  if (
    $("sidePosts")
  ) {
    $("sidePosts")
      .textContent =
      formatNumber(posts);
  }

  if (
    $("sideQuestions")
  ) {
    $("sideQuestions")
      .textContent =
      formatNumber(
        questions
      );
  }

  if (
    $("sideProperties")
  ) {
    $("sideProperties")
      .textContent =
      formatNumber(
        propertiesCount
      );
  }

  if (
    $("sidePhotos")
  ) {
    $("sidePhotos")
      .textContent =
      formatNumber(
        photos
      );
  }

  const uniqueMembers =
    new Set(
      allPosts
        .map(
          post =>
            post.authorId
        )
        .filter(Boolean)
    ).size;

  if (
    $("communityMemberCount")
  ) {
    $("communityMemberCount")
      .textContent =
      formatNumber(
        uniqueMembers
      );
  }
}


/* ============================================================
   SEARCH
============================================================ */

function handleSearch(
  value
) {
  searchTerm =
    value.trim();

  $("clearSearch")
    ?.classList.toggle(
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
    nearbyMode =
      false;

    $("locationFilterButton")
      ?.classList.remove(
        "active"
      );

    if (
      $("locationFilterButton")
    ) {
      $("locationFilterButton")
        .innerHTML = `
          <i class="fas fa-location-crosshairs"></i>
          <span>Nearby</span>
        `;
    }

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

    userLocation =
      location;

    nearbyMode =
      true;

    $("locationFilterButton")
      ?.classList.add(
        "active"
      );

    if (
      $("locationFilterButton")
    ) {
      $("locationFilterButton")
        .innerHTML = `
          <i class="fas fa-location-dot"></i>
          <span>Nearby</span>
        `;
    }

    if (
      $("sidebarLocationText")
    ) {
      $("sidebarLocationText")
        .textContent =
        location.label;
    }

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

function openImageViewer(
  url
) {
  if (!url) {
    return;
  }

  if ($("viewerImage")) {
    $("viewerImage").src =
      url;
  }

  $("imageViewer")
    ?.classList.add(
      "open"
    );

  document.body.classList.add(
    "modal-open"
  );
}


function closeImageViewer() {
  $("imageViewer")
    ?.classList.remove(
      "open"
    );

  if ($("viewerImage")) {
    $("viewerImage").src =
      "";
  }

  document.body.classList.remove(
    "modal-open"
  );
}


/* ============================================================
   DEEP LINK
============================================================ */

function handleDeepLink() {
  if (
    deepLinkHandled
  ) {
    return;
  }

  const params =
    new URLSearchParams(
      window.location.search
    );

  const postId =
    params.get("post");

  if (!postId) {
    return;
  }

  const exists =
    allPosts.some(
      post =>
        post.id ===
        postId
    );

  if (!exists) {
    return;
  }

  deepLinkHandled =
    true;

  openComments(
    postId
  );
}


/* ============================================================
   MODAL CLEANUP
============================================================ */

function closeReportModal() {
  $("reportModal")
    ?.classList.remove(
      "open"
    );

  document.body.classList.remove(
    "modal-open"
  );

  currentReportPostId =
    null;
}


/* ============================================================
   EVENT BINDING
============================================================ */

function bindStaticEvents() {
  $("openComposer")
    ?.addEventListener(
      "click",
      () =>
        openComposer()
    );

  $("mobileCreate")
    ?.addEventListener(
      "click",
      () =>
        openComposer()
    );

  document
    .querySelectorAll(
      "[data-open-type]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            openComposer(
              button.dataset
                .openType
            );
          }
        );
      }
    );

  document
    .querySelectorAll(
      ".post-type-option"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            selectedPostType =
              button.dataset
                .postType;

            document
              .querySelectorAll(
                ".post-type-option"
              )
              .forEach(
                item => {
                  item.classList.toggle(
                    "active",
                    item ===
                      button
                  );
                }
              );

            updateComposerFields();
          }
        );
      }
    );

  $("closeComposer")
    ?.addEventListener(
      "click",
      () => {
        resetComposer();
        closeComposer();
      }
    );

  $("cancelComposer")
    ?.addEventListener(
      "click",
      () => {
        resetComposer();
        closeComposer();
      }
    );

  $("postForm")
    ?.addEventListener(
      "submit",
      createPost
    );

  $("postContent")
    ?.addEventListener(
      "input",
      () => {
        const length =
          $("postContent")
            .value.length;

        if (
          $("characterCount")
        ) {
          $("characterCount")
            .textContent =
            `${length} / 5000`;
        }
      }
    );

  $("chooseImages")
    ?.addEventListener(
      "click",
      () =>
        $("postImages")
          ?.click()
    );

  $("postImages")
    ?.addEventListener(
      "change",
      event => {
        handleImageSelection(
          event.target
            .files
        );

        event.target.value =
          "";
      }
    );

  $("attachLocation")
    ?.addEventListener(
      "change",
      handleLocationToggle
    );

  document
    .querySelectorAll(
      ".category-btn"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            document
              .querySelectorAll(
                ".category-btn"
              )
              .forEach(
                item =>
                  item.classList.remove(
                    "active"
                  )
              );

            button.classList.add(
              "active"
            );

            activeCategory =
              button.dataset
                .category;

            applyFeedFilters();
          }
        );
      }
    );

  document
    .querySelectorAll(
      ".feed-tab"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            document
              .querySelectorAll(
                ".feed-tab"
              )
              .forEach(
                item =>
                  item.classList.remove(
                    "active"
                  )
              );

            button.classList.add(
              "active"
            );

            activeSort =
              button.dataset
                .sort;

            applyFeedFilters();
          }
        );
      }
    );

  $("communitySearch")
    ?.addEventListener(
      "input",
      event => {
        handleSearch(
          event.target.value
        );
      }
    );

  $("clearSearch")
    ?.addEventListener(
      "click",
      () => {
        if (
          $("communitySearch")
        ) {
          $("communitySearch")
            .value =
            "";
        }

        handleSearch("");

        $("communitySearch")
          ?.focus();
      }
    );

  $("headerSearchButton")
    ?.addEventListener(
      "click",
      () => {
        $("communitySearch")
          ?.focus();

        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });
      }
    );

  $("mobileSearch")
    ?.addEventListener(
      "click",
      () => {
        $("communitySearch")
          ?.focus();

        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });
      }
    );

  $("locationFilterButton")
    ?.addEventListener(
      "click",
      toggleNearby
    );

  $("closeComments")
    ?.addEventListener(
      "click",
      closeComments
    );

  $("commentForm")
    ?.addEventListener(
      "submit",
      submitComment
    );

  $("closeImageViewer")
    ?.addEventListener(
      "click",
      closeImageViewer
    );

  $("notificationButton")
    ?.addEventListener(
      "click",
      () => {
        window.location.href =
          "alert.html";
      }
    );

  $("mobileNotifications")
    ?.addEventListener(
      "click",
      () => {
        window.location.href =
          "alert.html";
      }
    );

  $("closeReport")
    ?.addEventListener(
      "click",
      closeReportModal
    );

  $("cancelReport")
    ?.addEventListener(
      "click",
      closeReportModal
    );

  $("reportForm")
    ?.addEventListener(
      "submit",
      submitReport
    );

  $("composerModal")
    ?.addEventListener(
      "click",
      event => {
        if (
          event.target ===
          $("composerModal")
        ) {
          resetComposer();
          closeComposer();
        }
      }
    );

  $("commentsModal")
    ?.addEventListener(
      "click",
      event => {
        if (
          event.target ===
          $("commentsModal")
        ) {
          closeComments();
        }
      }
    );

  $("reportModal")
    ?.addEventListener(
      "click",
      event => {
        if (
          event.target ===
          $("reportModal")
        ) {
          closeReportModal();
        }
      }
    );

  $("imageViewer")
    ?.addEventListener(
      "click",
      event => {
        if (
          event.target ===
            $("imageViewer") ||
          event.target ===
            $("viewerImage")
        ) {
          closeImageViewer();
        }
      }
    );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      if (
        $("composerModal")
          ?.classList.contains(
            "open"
          )
      ) {
        resetComposer();
        closeComposer();

        return;
      }

      if (
        $("commentsModal")
          ?.classList.contains(
            "open"
          )
      ) {
        closeComments();

        return;
      }

      if (
        $("reportModal")
          ?.classList.contains(
            "open"
          )
      ) {
        closeReportModal();

        return;
      }

      if (
        $("imageViewer")
          ?.classList.contains(
            "open"
          )
      ) {
        closeImageViewer();
      }
    }
  );
}


/* ============================================================
   AUTH INITIALIZATION
============================================================ */

async function initializeCommunity(
  user
) {
  currentUser =
    user;

  try {
    await loadCurrentProfile(
      user
    );

    await loadProperties();

    subscribeToFeed();

    subscribeToNotifications();

    /*
     * Reset deep-link state when a new authenticated user
     * initializes the community.
     */
    deepLinkHandled =
      false;
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


bindStaticEvents();


/* ============================================================
   AUTH STATE
============================================================ */

onAuthStateChanged(
  auth,
  async user => {
    if (!user) {
      currentUser =
        null;

      currentProfile =
        null;

      if (
        feedUnsubscribe
      ) {
        feedUnsubscribe();

        feedUnsubscribe =
          null;
      }

      if (
        commentsUnsubscribe
      ) {
        commentsUnsubscribe();

        commentsUnsubscribe =
          null;
      }

      if (
        notificationUnsubscribe
      ) {
        notificationUnsubscribe();

        notificationUnsubscribe =
          null;
      }

      window.location.href =
        "../dashboard/sign-in.html";

      return;
    }

    /*
     * Prevent unnecessary duplicate initialization for the same
     * authenticated Firebase user.
     */
    if (
      initializedUserId ===
      user.uid
    ) {
      return;
    }

    initializedUserId =
      user.uid;

    await initializeCommunity(
      user
    );
  }
);


/* ============================================================
   PERIODIC RELATIVE-TIME REFRESH
============================================================ */

setInterval(
  () => {
    if (
      !allPosts.length
    ) {
      return;
    }

    /*
     * Keeps "2m ago", "3m ago", etc. current without
     * performing another Firestore request.
     */
    applyFeedFilters();
  },
  60000
);


/* ============================================================
   PAGE VISIBILITY
============================================================ */

document.addEventListener(
  "visibilitychange",
  () => {
    if (
      document.visibilityState ===
      "visible"
    ) {
      updateNetworkState();

      /*
       * Refresh relative timestamps when returning to the page.
       */
      if (
        allPosts.length
      ) {
        applyFeedFilters();
      }
    }
  }
);


/* ============================================================
   PAGE UNLOAD CLEANUP
============================================================ */

window.addEventListener(
  "beforeunload",
  () => {
    if (
      feedUnsubscribe
    ) {
      feedUnsubscribe();
    }

    if (
      commentsUnsubscribe
    ) {
      commentsUnsubscribe();
    }

    if (
      notificationUnsubscribe
    ) {
      notificationUnsubscribe();
    }

    selectedImages.forEach(
      item => {
        try {
          URL.revokeObjectURL(
            item.preview
          );
        } catch {}
      }
    );
  }
);