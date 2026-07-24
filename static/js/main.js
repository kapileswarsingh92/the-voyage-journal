(function () {
  "use strict";

  // Mobile nav toggle
  var toggle = document.querySelector(".nav-toggle");
  var mobileNav = document.querySelector(".main-nav--mobile");
  if (toggle && mobileNav) {
    toggle.addEventListener("click", function () {
      var open = mobileNav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // ---- Photo crop/zoom tool (shared by the cover photo field and the rich
  // editor's "Insert photo" flow) — lets an author reframe a photo (drag to
  // reposition, slider to zoom, optionally pick a frame shape) before it's
  // attached to the story, instead of only relying on the server's
  // shrink-to-fit resize. Built from scratch with plain Canvas (no crop
  // library was installable in this sandbox), following the familiar
  // "avatar cropper" pattern: the image sits behind a fixed on-screen
  // viewport, scaled to always cover it, and the visible region is what
  // gets rendered out.
  (function () {
    var overlay, viewport, modalImg, zoomSlider, zoomRow, aspectRow, applyBtn, skipBtn, titleEl, hintEl, closeBtn;
    var stage, stageImg, rectEl;
    var state = null;
    var MIN_RECT = 30; // smallest a freeform crop rectangle can be shrunk to, in on-screen px

    function ensureModal() {
      if (overlay) return;
      overlay = document.createElement("div");
      overlay.className = "crop-modal-overlay";
      overlay.hidden = true;
      overlay.innerHTML =
        '<div class="crop-modal" role="dialog" aria-modal="true" aria-label="Adjust photo">' +
        '<button type="button" class="crop-modal-close" aria-label="Close">&times;</button>' +
        '<h3 data-crop-title>Adjust photo</h3>' +
        '<p class="crop-modal-hint" data-crop-hint></p>' +
        '<div class="crop-aspect-toggle" data-crop-aspect-toggle hidden>' +
        '<button type="button" data-aspect="original">Original</button>' +
        '<button type="button" data-aspect="wide">Wide</button>' +
        '<button type="button" data-aspect="square">Square</button>' +
        '<button type="button" data-aspect="freeform">Freeform</button>' +
        "</div>" +
        '<div class="crop-viewport" data-crop-viewport><img data-crop-img alt=""></div>' +
        '<div class="crop-stage" data-crop-stage hidden>' +
        '<div class="crop-stage-inner" data-crop-stage-inner>' +
        '<img data-crop-stage-img alt="">' +
        '<div class="crop-rect" data-crop-rect>' +
        '<div class="crop-rect-handle" data-handle="nw"></div>' +
        '<div class="crop-rect-handle" data-handle="ne"></div>' +
        '<div class="crop-rect-handle" data-handle="sw"></div>' +
        '<div class="crop-rect-handle" data-handle="se"></div>' +
        '<div class="crop-rect-handle crop-rect-handle-edge" data-handle="n"></div>' +
        '<div class="crop-rect-handle crop-rect-handle-edge" data-handle="s"></div>' +
        '<div class="crop-rect-handle crop-rect-handle-edge" data-handle="e"></div>' +
        '<div class="crop-rect-handle crop-rect-handle-edge" data-handle="w"></div>' +
        "</div>" +
        "</div>" +
        "</div>" +
        '<div class="crop-zoom-row" data-crop-zoom-row>' +
        '<span aria-hidden="true">−</span>' +
        '<input type="range" min="0" max="100" value="0" data-crop-zoom aria-label="Zoom">' +
        '<span aria-hidden="true">+</span>' +
        "</div>" +
        '<div class="crop-modal-actions">' +
        '<button type="button" class="btn btn-outline btn-sm" data-crop-skip>Use original, skip crop</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-crop-apply>Use this crop</button>' +
        "</div>" +
        "</div>";
      document.body.appendChild(overlay);

      viewport = overlay.querySelector("[data-crop-viewport]");
      modalImg = overlay.querySelector("[data-crop-img]");
      zoomSlider = overlay.querySelector("[data-crop-zoom]");
      zoomRow = overlay.querySelector("[data-crop-zoom-row]");
      aspectRow = overlay.querySelector("[data-crop-aspect-toggle]");
      skipBtn = overlay.querySelector("[data-crop-skip]");
      applyBtn = overlay.querySelector("[data-crop-apply]");
      titleEl = overlay.querySelector("[data-crop-title]");
      hintEl = overlay.querySelector("[data-crop-hint]");
      closeBtn = overlay.querySelector(".crop-modal-close");
      stage = overlay.querySelector("[data-crop-stage]");
      stageImg = overlay.querySelector("[data-crop-stage-img]");
      rectEl = overlay.querySelector("[data-crop-rect]");

      closeBtn.addEventListener("click", function () { finish(null); });
      overlay.addEventListener("click", function (e) { if (e.target === overlay) finish(null); });
      skipBtn.addEventListener("click", function () { finish("skip"); });
      applyBtn.addEventListener("click", function () { finish("apply"); });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && overlay && !overlay.hidden) finish(null);
      });

      zoomSlider.addEventListener("input", function () {
        if (!state) return;
        var t = zoomSlider.value / 100;
        state.scale = state.minScale + t * (state.maxScale - state.minScale);
        clampTranslate();
        applyTransform();
      });

      Array.prototype.forEach.call(aspectRow.querySelectorAll("button"), function (btn) {
        btn.addEventListener("click", function () {
          if (!state) return;
          Array.prototype.forEach.call(aspectRow.querySelectorAll("button"), function (b) {
            b.classList.toggle("is-active", b === btn);
          });
          setAspect(btn.getAttribute("data-aspect"));
        });
      });

      // Drag to reposition (mouse + touch).
      var dragging = false, startX = 0, startY = 0, startTx = 0, startTy = 0;
      function pointerPos(e) {
        var t = e.touches ? e.touches[0] : e;
        return { x: t.clientX, y: t.clientY };
      }
      function onDown(e) {
        if (!state) return;
        dragging = true;
        viewport.classList.add("is-dragging");
        var p = pointerPos(e);
        startX = p.x; startY = p.y; startTx = state.tx; startTy = state.ty;
        e.preventDefault();
      }
      function onMove(e) {
        if (!dragging || !state) return;
        var p = pointerPos(e);
        state.tx = startTx + (p.x - startX);
        state.ty = startTy + (p.y - startY);
        clampTranslate();
        applyTransform();
        e.preventDefault();
      }
      function onUp() {
        dragging = false;
        if (viewport) viewport.classList.remove("is-dragging");
      }
      viewport.addEventListener("mousedown", onDown);
      viewport.addEventListener("touchstart", onDown, { passive: false });
      window.addEventListener("mousemove", onMove);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchend", onUp);

      // Freeform crop rectangle: drag its body to move it, drag a handle to
      // resize it from that corner/edge. rectDrag.kind is either "move" or
      // one of the 8 handle directions ("nw", "n", "ne", "e", ...).
      var rectDrag = null;
      function rectPointerPos(e) {
        var t = e.touches ? e.touches[0] : e;
        return { x: t.clientX, y: t.clientY };
      }
      function onRectDown(kind) {
        return function (e) {
          if (!state || state.mode !== "freeform") return;
          rectDrag = {
            kind: kind,
            start: rectPointerPos(e),
            rect: { x: state.rect.x, y: state.rect.y, w: state.rect.w, h: state.rect.h },
          };
          e.preventDefault();
          e.stopPropagation();
        };
      }
      function onRectMove(e) {
        if (!rectDrag || !state) return;
        var p = rectPointerPos(e);
        var dx = p.x - rectDrag.start.x, dy = p.y - rectDrag.start.y;
        var r0 = rectDrag.rect;
        var r = { x: r0.x, y: r0.y, w: r0.w, h: r0.h };
        if (rectDrag.kind === "move") {
          r.x = r0.x + dx;
          r.y = r0.y + dy;
        } else {
          if (rectDrag.kind.indexOf("n") !== -1) { r.y = r0.y + dy; r.h = r0.h - dy; }
          if (rectDrag.kind.indexOf("s") !== -1) { r.h = r0.h + dy; }
          if (rectDrag.kind.indexOf("w") !== -1) { r.x = r0.x + dx; r.w = r0.w - dx; }
          if (rectDrag.kind.indexOf("e") !== -1) { r.w = r0.w + dx; }
          // A resize can flip x/w or y/h negative if dragged past the
          // opposite edge — clamp the size first so clampRect() below
          // always receives a sane, non-negative rectangle.
          if (r.w < MIN_RECT) { if (rectDrag.kind.indexOf("w") !== -1) r.x = r0.x + r0.w - MIN_RECT; r.w = MIN_RECT; }
          if (r.h < MIN_RECT) { if (rectDrag.kind.indexOf("n") !== -1) r.y = r0.y + r0.h - MIN_RECT; r.h = MIN_RECT; }
        }
        state.rect = clampRect(r);
        renderRectEl();
        e.preventDefault();
      }
      function onRectUp() {
        rectDrag = null;
      }
      rectEl.addEventListener("mousedown", onRectDown("move"));
      rectEl.addEventListener("touchstart", onRectDown("move"), { passive: false });
      Array.prototype.forEach.call(rectEl.querySelectorAll("[data-handle]"), function (handle) {
        var kind = handle.getAttribute("data-handle");
        handle.addEventListener("mousedown", onRectDown(kind));
        handle.addEventListener("touchstart", onRectDown(kind), { passive: false });
      });
      window.addEventListener("mousemove", onRectMove);
      window.addEventListener("touchmove", onRectMove, { passive: false });
      window.addEventListener("mouseup", onRectUp);
      window.addEventListener("touchend", onRectUp);
    }

    function viewportSize() {
      var rect = viewport.getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    }

    function setAspect(kind) {
      state.aspectKind = kind;
      if (kind === "freeform") {
        state.mode = "freeform";
        viewport.hidden = true;
        zoomRow.hidden = true;
        stage.hidden = false;
        hintEl.textContent = "Drag the box to reposition it, or drag a corner or edge to resize — the box can be any shape you like.";
        requestAnimationFrame(fitImageStage);
        return;
      }
      state.mode = "viewport";
      stage.hidden = true;
      zoomRow.hidden = false;
      viewport.hidden = false;
      hintEl.textContent = "Drag to reposition, and use the slider to zoom in.";
      var ratio;
      if (kind === "wide") ratio = 16 / 10.5;
      else if (kind === "square") ratio = 1;
      else ratio = state.naturalW / state.naturalH;
      viewport.style.aspectRatio = String(ratio);
      requestAnimationFrame(fitImage);
    }

    function fitImage() {
      if (!state) return;
      var vp = viewportSize();
      var base = Math.max(vp.w / state.naturalW, vp.h / state.naturalH);
      state.minScale = base;
      state.maxScale = base * 3;
      state.scale = base;
      state.tx = (vp.w - state.naturalW * base) / 2;
      state.ty = (vp.h - state.naturalH * base) / 2;
      zoomSlider.value = 0;
      clampTranslate();
      applyTransform();
    }

    function clampTranslate() {
      var vp = viewportSize();
      var scaledW = state.naturalW * state.scale;
      var scaledH = state.naturalH * state.scale;
      var minTx = Math.min(0, vp.w - scaledW);
      var minTy = Math.min(0, vp.h - scaledH);
      state.tx = Math.max(minTx, Math.min(0, state.tx));
      state.ty = Math.max(minTy, Math.min(0, state.ty));
    }

    function applyTransform() {
      modalImg.style.transform = "translate(" + state.tx + "px, " + state.ty + "px) scale(" + state.scale + ")";
    }

    function renderCrop() {
      var vp = viewportSize();
      var scale = state.scale;
      var sx = -state.tx / scale;
      var sy = -state.ty / scale;
      var sw = vp.w / scale;
      var sh = vp.h / scale;

      return rasterizeCrop(sx, sy, sw, sh);
    }

    // Shared by both crop modes: draws the chosen source rectangle (in
    // natural-image pixel coordinates) onto a canvas at the native pixel
    // detail actually visible, capped by state.maxDim so a heavily zoomed
    // crop never upscales a small source photo into mush, and a full-size
    // freeform crop never renders larger than the site actually stores.
    function rasterizeCrop(sx, sy, sw, sh) {
      var cap = state.maxDim || 2200;
      var targetW = Math.max(1, Math.min(cap, Math.round(sw)));
      var targetH = Math.max(1, Math.round(targetW * (sh / sw)));

      var canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(state.imgEl, sx, sy, sw, sh, 0, 0, targetW, targetH);

      var mime = state.file.type === "image/png" || state.file.type === "image/webp" ? state.file.type : "image/jpeg";
      var ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
      var baseName = (state.file.name || "photo").replace(/\.[^.]+$/, "");

      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          resolve(blob ? new File([blob], baseName + "-cropped." + ext, { type: mime }) : state.file);
        }, mime, 0.9);
      });
    }

    // ---- Freeform crop: whole image shown "contain"-fit inside a fixed
    // stage, with a draggable/resizable rectangle overlay the author can
    // put anywhere and size however they like (no locked aspect ratio).
    function fitImageStage() {
      if (!state) return;
      var stageRect = stage.getBoundingClientRect();
      var stageW = stageRect.width, stageH = stageRect.height;
      var scale = Math.min(stageW / state.naturalW, stageH / state.naturalH);
      var dispW = state.naturalW * scale, dispH = state.naturalH * scale;
      var offX = (stageW - dispW) / 2, offY = (stageH - dispH) / 2;
      state.stageBox = { scale: scale, offX: offX, offY: offY, dispW: dispW, dispH: dispH };

      stageImg.style.width = dispW + "px";
      stageImg.style.height = dispH + "px";
      stageImg.style.left = offX + "px";
      stageImg.style.top = offY + "px";

      var rw = dispW * 0.8, rh = dispH * 0.8;
      state.rect = { x: offX + (dispW - rw) / 2, y: offY + (dispH - rh) / 2, w: rw, h: rh };
      renderRectEl();
    }

    function renderRectEl() {
      rectEl.style.left = state.rect.x + "px";
      rectEl.style.top = state.rect.y + "px";
      rectEl.style.width = state.rect.w + "px";
      rectEl.style.height = state.rect.h + "px";
    }

    function clampRect(r) {
      var box = state.stageBox;
      var minX = box.offX, minY = box.offY, maxX = box.offX + box.dispW, maxY = box.offY + box.dispH;
      r.w = Math.max(MIN_RECT, Math.min(r.w, maxX - minX));
      r.h = Math.max(MIN_RECT, Math.min(r.h, maxY - minY));
      r.x = Math.max(minX, Math.min(r.x, maxX - r.w));
      r.y = Math.max(minY, Math.min(r.y, maxY - r.h));
      return r;
    }

    function renderFreeformCrop() {
      var box = state.stageBox;
      var r = state.rect;
      var sx = (r.x - box.offX) / box.scale;
      var sy = (r.y - box.offY) / box.scale;
      var sw = r.w / box.scale;
      var sh = r.h / box.scale;
      return rasterizeCrop(sx, sy, sw, sh);
    }

    function finish(action) {
      var settle = state && state.settle;
      var url = state && state.url;
      var result = null;
      if (action === "apply" && state) {
        result = state.mode === "freeform" ? renderFreeformCrop() : renderCrop();
      } else if (action === "skip" && state) {
        result = state.file;
      }
      overlay.hidden = true;
      state = null;
      var done = function (file) {
        if (url) URL.revokeObjectURL(url);
        if (settle) settle(file);
      };
      if (result && typeof result.then === "function") {
        result.then(done);
      } else {
        done(result);
      }
    }

    // Public entry point. Returns a Promise<File|null> — resolves with the
    // cropped photo, the original untouched (if the author skips or closes
    // without choosing), or null only if something went wrong before the
    // image could even be read.
    //   opts.aspect: "fixed-wide" (locked to the site's cover-photo ratio)
    //                or "free" (author can pick Original/Wide/Square/Freeform)
    //   opts.title / opts.hint: copy shown in the modal
    //   opts.maxDim: cap (px) on the longer side of the rendered crop —
    //     should match the server's own resize ceiling for this photo slot
    //     so a careful full-resolution crop isn't silently downscaled again.
    window.__openCropModal = function (file, opts) {
      opts = opts || {};
      ensureModal();
      return new Promise(function (settle) {
        var url = URL.createObjectURL(file);
        var probe = new Image();
        probe.onload = function () {
          state = {
            file: file, imgEl: probe, url: url,
            naturalW: probe.naturalWidth, naturalH: probe.naturalHeight,
            tx: 0, ty: 0, scale: 1, minScale: 1, maxScale: 3,
            mode: "viewport", maxDim: opts.maxDim || 2200,
            settle: settle,
          };
          modalImg.src = url;
          stageImg.src = url;
          titleEl.textContent = opts.title || "Adjust photo";
          hintEl.textContent = opts.hint || "Drag to reposition, and use the slider to zoom in.";
          overlay.hidden = false;
          stage.hidden = true;
          viewport.hidden = false;
          zoomRow.hidden = false;

          if (opts.aspect === "fixed-wide") {
            aspectRow.hidden = true;
            viewport.style.aspectRatio = String(16 / 10.5);
          } else {
            aspectRow.hidden = false;
            Array.prototype.forEach.call(aspectRow.querySelectorAll("button"), function (b) {
              b.classList.toggle("is-active", b.getAttribute("data-aspect") === "original");
            });
            viewport.style.aspectRatio = String(state.naturalW / state.naturalH);
          }
          // Wait a frame so the viewport has settled into its new on-screen
          // size (the aspect-ratio change above affects layout) before the
          // fit/scale math reads its actual pixel dimensions.
          requestAnimationFrame(fitImage);
        };
        probe.onerror = function () {
          URL.revokeObjectURL(url);
          settle(file); // couldn't even read it as an image — just pass the original through
        };
        probe.src = url;
      });
    };
  })();

  // Progressive-enhancement like button (falls back to normal form POST + redirect)
  var likeForm = document.querySelector("[data-like-form]");
  if (likeForm) {
    likeForm.addEventListener("submit", function (e) {
      var btn = likeForm.querySelector("[data-like-btn]");
      if (!btn) return; // not logged in -> plain link, nothing to intercept
      e.preventDefault();
      var formData = new FormData(likeForm);
      fetch(likeForm.action, {
        method: "POST",
        headers: { "X-Requested-With": "fetch" },
        body: formData,
      })
        .then(function (res) {
          if (!res.ok) throw new Error("request failed");
          return res.json();
        })
        .then(function (data) {
          var icon = btn.querySelector(".icon");
          var count = btn.querySelector("[data-like-count]");
          if (icon) icon.textContent = data.liked ? "♥" : "♡";
          if (count) count.textContent = data.count;
          btn.classList.toggle("is-active", data.liked);
        })
        .catch(function () {
          likeForm.submit();
        });
    });
  }

  // Lightbox for a story's photos — picks up both inline photos (scattered
  // through the story body) and any leftover gallery grid at the bottom.
  var lightbox = document.querySelector("[data-lightbox]");
  if (lightbox) {
    var lightboxImg = lightbox.querySelector("[data-lightbox-img]");
    var lightboxCaption = lightbox.querySelector("[data-lightbox-caption]");
    var thumbs = Array.prototype.slice.call(document.querySelectorAll("[data-gallery-thumb]"));
    var current = 0;

    function openAt(i) {
      current = (i + thumbs.length) % thumbs.length;
      var thumb = thumbs[current];
      lightboxImg.src = thumb.getAttribute("data-full");
      lightboxImg.alt = thumb.getAttribute("data-alt") || "";
      lightboxCaption.textContent = (current + 1) + " / " + thumbs.length;
      lightbox.hidden = false;
      document.body.style.overflow = "hidden";
    }
    function close() {
      lightbox.hidden = true;
      document.body.style.overflow = "";
    }

    thumbs.forEach(function (thumb, i) {
      thumb.addEventListener("click", function () {
        openAt(i);
      });
    });
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox || e.target.hasAttribute("data-lightbox-close")) close();
    });
    lightbox.querySelector("[data-lightbox-prev]").addEventListener("click", function () {
      openAt(current - 1);
    });
    lightbox.querySelector("[data-lightbox-next]").addEventListener("click", function () {
      openAt(current + 1);
    });
    document.addEventListener("keydown", function (e) {
      if (lightbox.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") openAt(current + 1);
      if (e.key === "ArrowLeft") openAt(current - 1);
    });
  }

  // Cover photo: same crop/zoom tool as inline photos, but locked to the
  // wide ratio the cover is always displayed at (cards, the feature
  // carousel, the story header thumbnail) so what the author frames is
  // what actually shows up, instead of the browser's CSS `object-fit`
  // cropping it unpredictably later.
  var coverInput = document.querySelector('input[name="cover_image"]');
  if (coverInput) {
    var coverWrap = document.createElement("div");
    coverWrap.className = "cover-preview-wrap";
    coverWrap.hidden = true;
    coverWrap.innerHTML =
      '<div class="cover-preview-thumb"><img data-cover-preview-img alt=""></div>' +
      '<div class="cover-preview-actions">' +
      '<button type="button" class="btn btn-outline btn-xs" data-cover-adjust>Adjust crop</button>' +
      '<button type="button" class="btn btn-ghost btn-xs" data-cover-clear>Remove photo</button>' +
      "</div>";
    coverInput.insertAdjacentElement("afterend", coverWrap);

    var coverPreviewImg = coverWrap.querySelector("[data-cover-preview-img]");
    var coverOriginalFile = null;

    function setCoverFile(file) {
      if (typeof DataTransfer === "undefined" || !file) return;
      var dt = new DataTransfer();
      dt.items.add(file);
      coverInput.files = dt.files;
      coverPreviewImg.src = URL.createObjectURL(file);
      coverWrap.hidden = false;
    }

    coverInput.addEventListener("change", function () {
      var file = coverInput.files && coverInput.files[0];
      if (!file) { coverWrap.hidden = true; coverOriginalFile = null; return; }
      if (file.size > 50 * 1024 * 1024) {
        window.alert('"' + file.name + '" is larger than 50MB — please choose a smaller photo.');
        coverInput.value = "";
        coverWrap.hidden = true;
        return;
      }
      coverOriginalFile = file;
      if (window.__openCropModal) {
        window.__openCropModal(file, {
          aspect: "fixed-wide",
          maxDim: 3000,
          title: "Adjust your cover photo",
          hint: "This shows as a wide banner across the site — drag to reposition, and use the slider to zoom in.",
        }).then(function (result) {
          setCoverFile(result || file);
        });
      } else {
        setCoverFile(file);
      }
    });

    coverWrap.querySelector("[data-cover-adjust]").addEventListener("click", function () {
      if (!coverOriginalFile || !window.__openCropModal) return;
      window.__openCropModal(coverOriginalFile, {
        aspect: "fixed-wide",
        maxDim: 3000,
        title: "Adjust your cover photo",
        hint: "Drag to reposition, and use the slider to zoom in.",
      }).then(function (result) {
        if (result) setCoverFile(result);
      });
    });

    coverWrap.querySelector("[data-cover-clear]").addEventListener("click", function () {
      coverInput.value = "";
      coverOriginalFile = null;
      coverWrap.hidden = true;
    });
  }

  // Rich story editor (submit page): lets a contributor insert a photo right
  // at the cursor position, alongside basic bold/italic/list formatting.
  // The contenteditable is progressive enhancement over a plain <textarea
  // data-rich-fallback> which remains the field that actually submits (kept
  // in sync on every edit) — so the form still works with JavaScript off.
  var richWrapper = document.querySelector("[data-rich-editor-wrapper]");
  if (richWrapper) {
    var richContent = richWrapper.querySelector("[data-rich-content]");
    var fallback = richWrapper.querySelector("[data-rich-fallback]");
    var photoPicker = richWrapper.querySelector("[data-inline-photo-picker]");
    var imagesInput = richWrapper.querySelector("[data-inline-images-input]");
    var photoPlanInput = richWrapper.querySelector("[data-photo-plan-input]");
    var toolbar = richWrapper.querySelector("[data-rich-toolbar]");
    var insertBtn = richWrapper.querySelector("[data-insert-photo]");
    var form = richWrapper.closest("form");

    var pendingFiles = new Map(); // uid -> File
    var savedRange = null;
    var maxGalleryImages = parseInt(richWrapper.getAttribute("data-max-gallery"), 10) || 0;

    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* best effort */ }

    function saveSelection() {
      var sel = window.getSelection();
      if (sel && sel.rangeCount && richContent.contains(sel.anchorNode)) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    }

    function restoreSelection() {
      var sel = window.getSelection();
      sel.removeAllRanges();
      if (savedRange) {
        sel.addRange(savedRange);
      } else {
        var r = document.createRange();
        r.selectNodeContents(richContent);
        r.collapse(false);
        sel.addRange(r);
      }
    }

    // --- import a story's content (real, sanitized HTML — the server hands
    // back the same HTML it stores whether this is the edit page's first
    // load or a re-render after a validation error) and swap any
    // [[photo:N]] paragraph tokens for either a real photo block (when we
    // know the story's already-saved photos — edit page, first load only)
    // or a "please re-attach" chip (after a validation error, when we no
    // longer have the underlying upload to show a thumbnail for). ---
    function makeExistingPhotoBlock(filename, url) {
      var wrapper = document.createElement("div");
      wrapper.className = "rt-photo-existing";
      wrapper.contentEditable = "false";
      wrapper.setAttribute("data-filename", filename);

      var img = document.createElement("img");
      img.src = url;
      img.alt = "";

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "rt-photo-remove";
      removeBtn.setAttribute("aria-label", "Remove photo");
      removeBtn.innerHTML = "&times;";
      removeBtn.addEventListener("click", function () {
        wrapper.remove();
        syncFallback();
      });

      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      return wrapper;
    }

    function importContent(html, images) {
      richContent.innerHTML = html || "";
      var tokenParas = Array.prototype.filter.call(richContent.querySelectorAll("p"), function (p) {
        return /^\[\[photo:\d+\]\]$/.test((p.textContent || "").trim());
      });
      tokenParas.forEach(function (p) {
        var n = parseInt((p.textContent || "").trim().match(/\d+/)[0], 10);
        var img = images && images[n - 1];
        if (img) {
          p.replaceWith(makeExistingPhotoBlock(img.filename, img.url));
        } else {
          var chip = document.createElement("div");
          chip.className = "rt-photo-chip";
          chip.contentEditable = "false";
          chip.textContent = "📷 Photo " + n + " — please re-attach this photo";
          p.replaceWith(chip);
        }
      });
    }

    if (fallback.value && fallback.value.trim()) {
      importContent(fallback.value, window.__existingStoryPhotos);
    }

    richWrapper.classList.add("js-rich-active");
    fallback.setAttribute("aria-hidden", "true");
    fallback.tabIndex = -1;

    // Chrome (and friends) don't necessarily wrap the very first line typed
    // into an empty contenteditable in a <p> — if you click in and start
    // typing without pressing Enter first, that text lands as a loose text
    // node directly under richContent, not inside any block element. Left
    // alone, two things break: a photo inserted while the cursor is in that
    // loose run lands wherever the raw DOM node happens to split (possibly
    // mid-word) instead of after the whole paragraph, and — critically —
    // the serialized output no longer reliably *starts* with a tag, which
    // is exactly the signal looks_like_html() on the server uses to tell
    // "real HTML from this editor" apart from "plain fallback text"; if it
    // starts with plain text instead, the server escapes the entire payload
    // as text and the story is destroyed. This walks richContent's direct
    // children and wraps any run of loose (non-block, non-photo-block)
    // nodes in a synthetic <p>, so the live editor stays well-formed as you
    // go and both problems are fixed at the source rather than papered over
    // at submit time.
    function isBlockOrPhotoNode(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      // TABLE is block-level too — pasted in from Word/Pages/Excel — so it
      // never gets swept up and wrapped inside a synthetic <p> the way a
      // loose run of text would be (a <table> nested inside a <p> is invalid
      // and would be unwrapped/mangled by the server sanitizer).
      if (["P", "DIV", "UL", "OL", "TABLE"].indexOf(node.tagName) !== -1) return true;
      return !!(node.classList && (
        node.classList.contains("rt-photo") ||
        node.classList.contains("rt-photo-existing") ||
        node.classList.contains("rt-photo-chip")
      ));
    }

    function normalizeLooseTopLevelNodes(root) {
      var child = root.firstChild;
      while (child) {
        if (isBlockOrPhotoNode(child)) {
          child = child.nextSibling;
          continue;
        }
        var wrapper = document.createElement("p");
        root.insertBefore(wrapper, child);
        while (child && !isBlockOrPhotoNode(child)) {
          var next = child.nextSibling;
          wrapper.appendChild(child);
          child = next;
        }
      }
    }

    // --- serialize contenteditable -> real, storage-ready HTML + ordered
    // photo files. The contenteditable already *is* real HTML (bold/italic/
    // list toolbar buttons and the font controls below all produce actual
    // <b>/<i>/<ul><li>/<span style> markup as you go) so serialization is
    // just: normalize any loose top-level text (see above), swap each photo
    // block for its [[photo:N]] token (kept in one gap-free sequence across
    // "existing" and "new" photos), drop leftover re-attach chips, and read
    // the result's innerHTML — no separate markdown-lite text format to
    // keep in sync anymore. The server re-sanitizes this against its own
    // allowlist regardless (see normalize_story_content / sanitize_story_html)
    // so nothing here needs to be trusted as the real safety boundary. ---
    function serialize() {
      normalizeLooseTopLevelNodes(richContent);
      var clone = richContent.cloneNode(true);
      var orderedRefs = [];
      var photoIndex = 0;

      var photoNodes = Array.prototype.slice.call(
        clone.querySelectorAll(".rt-photo, .rt-photo-existing, .rt-photo-chip")
      );
      photoNodes.forEach(function (node) {
        if (node.classList.contains("rt-photo-chip")) {
          node.remove(); // needs re-attaching after a validation error; drop silently
          return;
        }
        var token = document.createElement("p");
        if (node.classList.contains("rt-photo-existing")) {
          photoIndex += 1;
          orderedRefs.push({ type: "existing", filename: node.getAttribute("data-filename") });
          token.textContent = "[[photo:" + photoIndex + "]]";
          node.replaceWith(token);
          return;
        }
        var uid = node.getAttribute("data-uid");
        if (!pendingFiles.has(uid)) {
          node.remove();
          return;
        }
        photoIndex += 1;
        orderedRefs.push({ type: "new", uid: uid });
        token.textContent = "[[photo:" + photoIndex + "]]";
        node.replaceWith(token);
      });

      // Drop now-empty top-level paragraphs/divs (e.g. the blank <p><br></p>
      // the editor keeps around for the caret to land in) so they don't
      // pad out the story or throw off the length check.
      Array.prototype.forEach.call(Array.prototype.slice.call(clone.children), function (node) {
        if (
          (node.tagName === "P" || node.tagName === "DIV") &&
          !node.querySelector("img") &&
          !(node.textContent || "").trim()
        ) {
          node.remove();
        }
      });

      return { html: clone.innerHTML.trim(), orderedRefs: orderedRefs };
    }

    function syncFallback() {
      fallback.value = serialize().html;
    }

    // --- font family / size controls: wrap the current text selection in a
    // <span style="...">, or — if nothing's selected — apply as the story's
    // overall font by wrapping each top-level block's contents, so picking
    // a font is useful whether or not you've selected any text first. Each
    // control is applied as a single property (not the two controls' values
    // combined into one string) and merged into whatever style an existing
    // wrapper span already carries, so changing just the size doesn't wipe
    // out a family you (or a previous edit) already set, and vice versa. ---
    var fontFamilySelect = richWrapper.querySelector("[data-font-family]");
    var fontSizeSelect = richWrapper.querySelector("[data-font-size]");

    function parseStyleDecls(styleStr) {
      var map = {};
      (styleStr || "").split(";").forEach(function (decl) {
        var idx = decl.indexOf(":");
        if (idx === -1) return;
        var prop = decl.slice(0, idx).trim().toLowerCase();
        var value = decl.slice(idx + 1).trim();
        if (prop && value) map[prop] = value;
      });
      return map;
    }

    function styleDeclsToString(map) {
      var parts = [];
      if (map["font-family"]) parts.push("font-family: " + map["font-family"]);
      if (map["font-size"]) parts.push("font-size: " + map["font-size"]);
      return parts.join("; ");
    }

    function wrapRangeInStyledSpan(range, prop, value) {
      var frag = range.extractContents();
      var span = document.createElement("span");
      span.setAttribute("style", prop + ": " + value);
      span.appendChild(frag);
      range.insertNode(span);
      var sel = window.getSelection();
      var r = document.createRange();
      r.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(r);
      savedRange = r.cloneRange();
    }

    function wrapBlockChildrenInSpan(el, prop, value) {
      if (!el || !el.childNodes.length) return;
      var first = el.firstChild;
      // If this block's entire content is already exactly one <span>, reuse
      // it (merging in just the one property that changed) instead of
      // nesting another wrapper around it or discarding whatever other
      // property it already carries. Not gated on any marker attribute —
      // the server sanitizer strips unknown attributes, so after any
      // save+reload the span's role as "this block's one style wrapper"
      // has to be inferred structurally instead.
      var isOwnWrapper = el.childNodes.length === 1 && first.nodeType === Node.ELEMENT_NODE &&
        first.tagName === "SPAN";
      var decls = isOwnWrapper ? parseStyleDecls(first.getAttribute("style")) : {};
      if (value) decls[prop] = value; else delete decls[prop];
      var newStyle = styleDeclsToString(decls);

      if (isOwnWrapper) {
        if (newStyle) {
          first.setAttribute("style", newStyle);
        } else {
          while (first.firstChild) el.insertBefore(first.firstChild, first);
          el.removeChild(first);
        }
        return;
      }
      if (!newStyle) return;
      var span = document.createElement("span");
      span.setAttribute("style", newStyle);
      while (el.firstChild) span.appendChild(el.firstChild);
      el.appendChild(span);
    }

    function applyBaseFontProp(prop, value) {
      Array.prototype.forEach.call(richContent.children, function (node) {
        if (
          node.classList &&
          (node.classList.contains("rt-photo") ||
            node.classList.contains("rt-photo-existing") ||
            node.classList.contains("rt-photo-chip"))
        ) {
          return;
        }
        if (node.tagName === "UL" || node.tagName === "OL") {
          Array.prototype.forEach.call(node.children, function (li) { wrapBlockChildrenInSpan(li, prop, value); });
        } else if (node.tagName === "P" || node.tagName === "DIV") {
          wrapBlockChildrenInSpan(node, prop, value);
        }
      });
    }

    function handleFontControlChange(prop, value) {
      var liveSel = window.getSelection();
      var range = null;
      if (liveSel && liveSel.rangeCount && richContent.contains(liveSel.anchorNode) && !liveSel.getRangeAt(0).collapsed) {
        range = liveSel.getRangeAt(0);
      } else if (savedRange && richContent.contains(savedRange.startContainer) && !savedRange.collapsed) {
        range = savedRange;
      }
      richContent.focus();
      if (range) {
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        if (value) wrapRangeInStyledSpan(sel.getRangeAt(0), prop, value);
      } else {
        applyBaseFontProp(prop, value);
      }
      saveSelection();
      syncFallback();
    }

    if (fontFamilySelect) {
      fontFamilySelect.addEventListener("change", function () {
        handleFontControlChange("font-family", fontFamilySelect.value);
      });
    }
    if (fontSizeSelect) {
      fontSizeSelect.addEventListener("change", function () {
        handleFontControlChange("font-size", fontSizeSelect.value);
      });
    }

    // Reflect an already-set base font (e.g. re-opening a story you styled
    // earlier) in the toolbar controls themselves — otherwise they'd show
    // "Default" even though the story already has a font applied, and the
    // next change would only be merged in blind rather than shown as the
    // active choice. Best-effort: only looks at the very first content
    // block's style, and only takes if it exactly matches one of the
    // dropdown's known options.
    (function syncFontControlsFromContent() {
      var firstBlock = richContent.querySelector("p, li");
      if (!firstBlock || firstBlock.childNodes.length !== 1) return;
      if (firstBlock.firstChild.nodeType !== Node.ELEMENT_NODE || firstBlock.firstChild.tagName !== "SPAN") return;
      var decls = parseStyleDecls(firstBlock.firstChild.getAttribute("style"));
      if (fontFamilySelect && decls["font-family"]) {
        var fam = decls["font-family"];
        var famMatch = Array.prototype.some.call(fontFamilySelect.options, function (o) { return o.value === fam; });
        if (famMatch) fontFamilySelect.value = fam;
      }
      if (fontSizeSelect && decls["font-size"]) {
        var size = decls["font-size"];
        var sizeMatch = Array.prototype.some.call(fontSizeSelect.options, function (o) { return o.value === size; });
        if (sizeMatch) fontSizeSelect.value = size;
      }
    })();

    richContent.addEventListener("keyup", saveSelection);
    richContent.addEventListener("mouseup", saveSelection);
    richContent.addEventListener("input", function () {
      saveSelection();
      syncFallback();
    });

    // --- paste from Word / Pages / Excel / Google Docs, etc. ---
    // The browser's native rich paste already reproduces bold/italic/lists,
    // font-family & font-size (as inline <span style>), and full <table>
    // markup as real HTML — the same shapes the toolbar itself produces —
    // so the server's allowlist sanitizer (which now also keeps table tags
    // and accepts "pt" font sizes, the unit Word/Pages paste uses) covers
    // pasted content the same way it covers typed/toolbar-formatted content.
    // The one thing native paste can't hand off correctly is images: a
    // copied image normally lands as inline <img src="data:..."> or a
    // blob:/file: reference, but a story's images have to be real uploaded
    // files (for the crop step, gallery limits, and disk cleanup later) —
    // an <img> tag isn't on the sanitizer's allowlist at all, so left alone
    // it would just silently vanish on save. Instead: any image files
    // actually present on the clipboard are pulled out and routed through
    // the exact same insertPhoto() the toolbar's "Insert photo" button
    // uses; any leftover <img> the browser inserted anyway (a reference we
    // can't recover real bytes from) is swapped for a plain re-attach
    // notice so nothing disappears without a trace.
    function currentPhotoCount() {
      return richContent.querySelectorAll(".rt-photo, .rt-photo-existing").length;
    }

    function cleanUpStrayPastedImages() {
      var strays = Array.prototype.filter.call(richContent.querySelectorAll("img"), function (img) {
        return !img.closest(".rt-photo, .rt-photo-existing, .rt-photo-chip");
      });
      strays.forEach(function (img) {
        var chip = document.createElement("div");
        chip.className = "rt-photo-chip";
        chip.contentEditable = "false";
        chip.textContent = "📷 An image from your paste couldn't be attached automatically — please use “Insert photo” to add it.";
        img.replaceWith(chip);
      });
    }

    richContent.addEventListener("paste", function (e) {
      var cd = e.clipboardData;
      if (!cd) return;

      var imageFiles = [];
      for (var i = 0; i < cd.items.length; i++) {
        var item = cd.items[i];
        if (item.kind === "file" && item.type && item.type.indexOf("image/") === 0) {
          var f = item.getAsFile();
          if (f) imageFiles.push(f);
        }
      }

      if (!imageFiles.length) {
        // No recoverable image bytes on the clipboard — let the browser's
        // normal rich paste bring in text, formatting and tables as-is,
        // then just sweep up any orphaned <img> reference afterwards.
        setTimeout(function () {
          cleanUpStrayPastedImages();
          syncFallback();
        }, 0);
        return;
      }

      // Real image bytes are present — take over the paste so each image
      // goes through the managed upload flow instead of landing as an
      // orphaned data: URI the server would just strip back out.
      e.preventDefault();
      richContent.focus();
      restoreSelection();

      var html = cd.getData("text/html");
      var text = cd.getData("text/plain");
      if (html) {
        document.execCommand("insertHTML", false, html);
      } else if (text) {
        document.execCommand("insertText", false, text);
      }
      // The HTML we just inserted may itself reference the same images
      // (Word/Pages often includes both) — strip those so nothing ends up
      // attached twice.
      cleanUpStrayPastedImages();

      var room = maxGalleryImages ? maxGalleryImages - currentPhotoCount() : imageFiles.length;
      room = Math.max(room, 0);
      imageFiles.slice(0, room).forEach(function (file) {
        insertPhoto(file);
      });
      if (imageFiles.length > room) {
        window.alert(
          "This story can have up to " + maxGalleryImages + " photos in total, so " +
          (imageFiles.length - room) + " pasted image(s) weren't added. Remove a photo, " +
          "then use “Insert photo” to add the rest."
        );
      }
      saveSelection();
      syncFallback();
    });

    // --- toolbar: bold / italic / bullet list ---
    toolbar.addEventListener("mousedown", function (e) {
      if (e.target.closest("[data-cmd]")) e.preventDefault(); // don't steal focus/selection
    });
    toolbar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-cmd]");
      if (!btn) return;
      richContent.focus();
      document.execCommand(btn.getAttribute("data-cmd"), false, null);
      syncFallback();
    });

    // --- insert photo at cursor ---
    insertBtn.addEventListener("mousedown", saveSelection);
    insertBtn.addEventListener("click", function () {
      photoPicker.value = "";
      photoPicker.click();
    });
    photoPicker.addEventListener("change", function () {
      var file = photoPicker.files && photoPicker.files[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) {
        window.alert('"' + file.name + '" is larger than 50MB — please choose a smaller photo.');
        return;
      }
      if (window.__openCropModal) {
        window.__openCropModal(file, {
          aspect: "free",
          maxDim: 2600,
          title: "Adjust this photo",
          hint: "Drag to reposition and zoom in, pick a frame shape below, or choose Freeform for a fully custom crop — or just use it as-is.",
        }).then(function (result) {
          insertPhoto(result || file);
        });
      } else {
        insertPhoto(file);
      }
    });

    function insertPhoto(file) {
      var uid = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      pendingFiles.set(uid, file);
      var url = URL.createObjectURL(file);

      var wrapper = document.createElement("div");
      wrapper.className = "rt-photo";
      wrapper.contentEditable = "false";
      wrapper.setAttribute("data-uid", uid);

      var img = document.createElement("img");
      img.src = url;
      img.alt = "";

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "rt-photo-remove";
      removeBtn.setAttribute("aria-label", "Remove photo");
      removeBtn.innerHTML = "&times;";
      removeBtn.addEventListener("click", function () {
        pendingFiles.delete(uid);
        wrapper.remove();
        syncFallback();
      });

      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);

      // Walk up from the cursor to whichever node is a direct child of the
      // editor (a <p>, <ul>, ...) so the photo always lands as its own
      // top-level block — never nested inside a paragraph, which would
      // otherwise corrupt serialization (the photo has to be a sibling of
      // paragraphs, not a child of one, for the [[photo:N]] token logic to see it).
      function topLevelNodeFor(node) {
        while (node && node.parentNode !== richContent) {
          node = node.parentNode;
        }
        return node;
      }

      richContent.focus();
      restoreSelection();
      var sel = window.getSelection();
      var range = sel.rangeCount ? sel.getRangeAt(0) : null;
      var anchor = range && richContent.contains(range.startContainer)
        ? topLevelNodeFor(range.startContainer)
        : null;

      if (anchor && anchor.parentNode === richContent) {
        richContent.insertBefore(wrapper, anchor.nextSibling);
      } else {
        richContent.appendChild(wrapper);
      }

      // Make sure there's a paragraph right after the photo to keep typing into.
      var nextEl = wrapper.nextSibling;
      var nextIsBlock = nextEl && nextEl.nodeType === Node.ELEMENT_NODE &&
        ["P", "DIV", "UL", "OL"].indexOf(nextEl.tagName) !== -1;
      if (!nextIsBlock) {
        var freshPara = document.createElement("p");
        freshPara.appendChild(document.createElement("br"));
        richContent.insertBefore(freshPara, wrapper.nextSibling);
        nextEl = freshPara;
      }

      var caretRange = document.createRange();
      caretRange.selectNodeContents(nextEl);
      caretRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caretRange);

      saveSelection();
      syncFallback();
    }

    // --- on submit: push the final serialized HTML + ordered files into the real form fields ---
    if (form) {
      form.addEventListener("submit", function () {
        var result = serialize();
        fallback.value = result.html;
        if (result.orderedRefs.length && typeof DataTransfer !== "undefined") {
          var dt = new DataTransfer();
          var planParts = [];
          result.orderedRefs.forEach(function (ref) {
            if (ref.type === "existing") {
              planParts.push("existing:" + ref.filename);
              return;
            }
            planParts.push("new");
            var file = pendingFiles.get(ref.uid);
            if (file) dt.items.add(file);
          });
          imagesInput.files = dt.files;
          if (photoPlanInput) photoPlanInput.value = planParts.join(",");
        } else if (photoPlanInput) {
          photoPlanInput.value = "";
        }
      });
    }

    // --- Preview: shows the story exactly as it'll appear once published —
    // title, cover, formatted text and placed photos — without submitting
    // anything. Built lazily on first use and reused after that.
    var previewBtn = form ? form.querySelector("[data-preview-story]") : null;
    if (previewBtn) {
      var previewOverlay, previewTitleEl, previewMetaEl, previewCoverWrap, previewCoverImg, previewBodyEl;

      var ensurePreviewModal = function () {
        if (previewOverlay) return;
        previewOverlay = document.createElement("div");
        previewOverlay.className = "preview-modal-overlay";
        previewOverlay.hidden = true;
        previewOverlay.innerHTML =
          '<div class="preview-modal" role="dialog" aria-modal="true" aria-label="Story preview">' +
          '<button type="button" class="crop-modal-close" data-preview-close aria-label="Close">&times;</button>' +
          '<p class="eyebrow">Preview — exactly how readers will see this</p>' +
          '<div class="preview-modal-scroll">' +
          '<div class="preview-cover" data-preview-cover hidden><img data-preview-cover-img alt=""></div>' +
          '<p class="preview-meta" data-preview-meta></p>' +
          '<h2 data-preview-title></h2>' +
          '<div class="post-content" data-preview-body></div>' +
          "</div>" +
          '<div class="crop-modal-actions preview-modal-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-preview-close>Close preview</button>' +
          "</div>" +
          "</div>";
        document.body.appendChild(previewOverlay);
        previewTitleEl = previewOverlay.querySelector("[data-preview-title]");
        previewMetaEl = previewOverlay.querySelector("[data-preview-meta]");
        previewCoverWrap = previewOverlay.querySelector("[data-preview-cover]");
        previewCoverImg = previewOverlay.querySelector("[data-preview-cover-img]");
        previewBodyEl = previewOverlay.querySelector("[data-preview-body]");
        Array.prototype.forEach.call(previewOverlay.querySelectorAll("[data-preview-close]"), function (btn) {
          btn.addEventListener("click", closePreview);
        });
        previewOverlay.addEventListener("click", function (e) { if (e.target === previewOverlay) closePreview(); });
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && previewOverlay && !previewOverlay.hidden) closePreview();
        });
      };

      var closePreview = function () {
        if (previewOverlay) previewOverlay.hidden = true;
      };

      var buildPreviewBodyHTML = function () {
        var result = serialize();
        return result.html.replace(
          /<p>\s*\[\[photo:(\d+)\]\]\s*<\/p>|\[\[photo:(\d+)\]\]/g,
          function (whole, n1, n2) {
            var n = parseInt(n1 || n2, 10);
            var ref = result.orderedRefs[n - 1];
            if (!ref) return "";
            var url = "";
            if (ref.type === "existing") {
              var matches = (window.__existingStoryPhotos || []).filter(function (p) {
                return p.filename === ref.filename;
              });
              url = matches.length ? matches[0].url : "";
            } else {
              var file = pendingFiles.get(ref.uid);
              url = file ? URL.createObjectURL(file) : "";
            }
            if (!url) return "";
            return '<figure class="inline-photo"><img src="' + url + '" alt="Story photo ' + n + '" loading="lazy"></figure>';
          }
        );
      };

      previewBtn.addEventListener("click", function () {
        ensurePreviewModal();
        syncFallback();

        var titleInput = form.querySelector("#title");
        var categorySelect = form.querySelector("#category");
        var locationInput = form.querySelector("#location");
        var authorInput = form.querySelector("#author_name");

        previewTitleEl.textContent = (titleInput && titleInput.value.trim()) || "Untitled story";
        var metaParts = [];
        if (categorySelect && categorySelect.value) metaParts.push(categorySelect.value);
        if (locationInput && locationInput.value.trim()) metaParts.push(locationInput.value.trim());
        if (authorInput && authorInput.value.trim()) metaParts.push("by " + authorInput.value.trim());
        previewMetaEl.textContent = metaParts.join(" · ");

        var coverFile = coverInput && coverInput.files && coverInput.files[0];
        var coverUrl = coverFile ? URL.createObjectURL(coverFile) : (window.__existingCoverUrl || "");
        if (coverUrl) {
          previewCoverImg.src = coverUrl;
          previewCoverWrap.hidden = false;
        } else {
          previewCoverWrap.hidden = true;
        }

        previewBodyEl.innerHTML = buildPreviewBodyHTML() || "<p><em>Nothing written yet.</em></p>";
        previewOverlay.hidden = false;
      });
    }
  }

  // Share menu toggle
  var shareToggle = document.querySelector("[data-share-toggle]");
  var shareMenu = document.querySelector("[data-share-menu]");
  if (shareToggle && shareMenu) {
    shareToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      shareMenu.hidden = !shareMenu.hidden;
    });
    document.addEventListener("click", function (e) {
      if (!shareMenu.hidden && !shareMenu.contains(e.target) && e.target !== shareToggle) {
        shareMenu.hidden = true;
      }
    });

    // Best-effort share tracking: a click on any share option counts as a
    // "share" for the story owner's stats, even though we can't know for
    // sure the person followed through on the external site.
    var shareWrap = shareMenu.closest("[data-slug]");
    if (shareWrap && window.__csrf) {
      var trackShare = function () {
        var body = new URLSearchParams();
        body.set("csrf_token", window.__csrf);
        fetch("/blog/" + shareWrap.getAttribute("data-slug") + "/share", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        }).catch(function () { /* non-critical, ignore */ });
      };
      Array.prototype.forEach.call(shareMenu.querySelectorAll("a, [data-copy-link]"), function (el) {
        el.addEventListener("click", trackShare);
      });
    }

    var copyBtn = shareMenu.querySelector("[data-copy-link]");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var url = copyBtn.getAttribute("data-copy-link");
        var done = function () {
          var original = copyBtn.textContent;
          copyBtn.textContent = "Link copied!";
          setTimeout(function () {
            copyBtn.textContent = original;
          }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done).catch(function () {
            window.prompt("Copy this link:", url);
          });
        } else {
          window.prompt("Copy this link:", url);
        }
      });
    }
  }

  // Homepage "Featured" carousel — auto-advances left to right every N ms
  // (set via data-interval, defaults to 15s) when there's more than one
  // pinned/featured story. Pauses while the pointer or keyboard focus is on
  // it so a reader isn't yanked away mid-read, and respects
  // prefers-reduced-motion by disabling the sliding transition (it still
  // advances, just as an instant cut instead of a slide).
  var carousel = document.querySelector("[data-feature-carousel]");
  if (carousel) {
    var track = carousel.querySelector("[data-feature-track]");
    var slides = Array.prototype.slice.call(carousel.querySelectorAll(".feature-slide"));
    var dots = Array.prototype.slice.call(carousel.querySelectorAll("[data-feature-dot]"));
    var prevBtn = carousel.querySelector("[data-feature-prev]");
    var nextBtn = carousel.querySelector("[data-feature-next]");
    var interval = parseInt(carousel.getAttribute("data-interval"), 10) || 15000;
    var index = 0;
    var timer = null;

    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) track.style.transition = "none";

    function goTo(i) {
      index = (i + slides.length) % slides.length;
      track.style.transform = "translateX(-" + (index * 100) + "%)";
      dots.forEach(function (dot, di) {
        dot.classList.toggle("is-active", di === index);
      });
    }

    function next() { goTo(index + 1); }
    function prev() { goTo(index - 1); }

    function start() {
      if (slides.length < 2) return;
      stop();
      timer = setInterval(next, interval);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    if (slides.length > 1) {
      if (prevBtn) prevBtn.addEventListener("click", function () { prev(); start(); });
      if (nextBtn) nextBtn.addEventListener("click", function () { next(); start(); });
      dots.forEach(function (dot, di) {
        dot.addEventListener("click", function () { goTo(di); start(); });
      });
      carousel.addEventListener("mouseenter", stop);
      carousel.addEventListener("mouseleave", start);
      carousel.addEventListener("focusin", stop);
      carousel.addEventListener("focusout", start);
      start();
    }

    // Expose a tiny hook for automated testing/debugging (harmless in
    // production — just lets a test script read/drive carousel state
    // without needing to wait out real setInterval delays).
    carousel.__testCarousel = { goTo: goTo, next: next, prev: prev, getIndex: function () { return index; } };
  }

  // ---- Scroll reveal: fade/slide repeating content blocks (post cards,
  // feature cards, stat tiles, trending items, etc.) in as they enter the
  // viewport, so scanning the page feels considered rather than everything
  // being static from load. This is intentionally attribute-driven from
  // here rather than requiring every template to opt in by hand — it just
  // tags a known set of selectors at load time.
  //
  // Two things this deliberately does NOT animate:
  //   - anything already visible on load (checked against viewport height
  //     up front) — no point animating what's already in view, and it
  //     avoids a flash-of-invisible-content on first paint
  //   - anything at all, if the visitor has prefers-reduced-motion set, or
  //     if IntersectionObserver isn't available — elements are left
  //     exactly as authored, fully visible, no [data-reveal] added
  (function initScrollReveal() {
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) return;

    var selector = [
      ".post-card", ".feature-card", ".step", ".trending-item",
      ".stat-card", ".story-manage-card", ".admin-item", ".sidebar-card"
    ].join(", ");
    var targets = Array.prototype.slice.call(document.querySelectorAll(selector));
    if (!targets.length) return;

    var vh = window.innerHeight || document.documentElement.clientHeight;
    var toObserve = [];
    targets.forEach(function (el, i) {
      var rect = el.getBoundingClientRect();
      if (rect.top < vh * 0.92) return; // already on screen — leave it alone
      el.setAttribute("data-reveal", "");
      el.style.transitionDelay = (Math.min(i % 6, 5) * 60) + "ms";
      toObserve.push(el);
    });
    if (!toObserve.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    toObserve.forEach(function (el) { observer.observe(el); });

    // Safety net: force-reveal anything left over after a few seconds
    // regardless of scroll/intersection state. Protects search-engine
    // crawlers, link-preview bots, print/PDF export, and any other
    // non-interactive rendering from ever seeing permanently blank
    // content just because nothing "scrolled" in the traditional sense —
    // real visitors will almost always see the scroll-triggered reveal
    // first, this is purely a backstop.
    setTimeout(function () {
      toObserve.forEach(function (el) { el.classList.add("is-revealed"); });
      observer.disconnect();
    }, 2500);
  })();
})();
