/**
 * SOOK JAI PIX – ระบบจองคิวช่างภาพ
 * app.js – Offline-First Application Logic
 */

'use strict';

/* ============================================================
   CONSTANTS & STATE
   ============================================================ */
const STORAGE_KEY = 'sookjaipix_bookings';
const AUTOSAVE_DELAY = 800; // ms debounce

let currentBookingId = null; // null = new booking
let autosaveTimer = null;
let allBookings = [];

/* ============================================================
   UTILITY HELPERS
   ============================================================ */

/** Format number to Thai currency string */
function formatCurrency(n) {
  const num = parseFloat(n) || 0;
  return '฿' + num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Format number with commas */
function formatNumber(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('th-TH');
}

/** Format Date object to Thai Buddhist calendar string */
function formatThaiDate(dateStr) {
  if (!dateStr) return '–';
  const [y, m, d] = dateStr.split('-');
  const buddhistYear = parseInt(y) + 543;
  const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${parseInt(d)} ${monthNames[parseInt(m) - 1]} ${buddhistYear}`;
}

/** Get today's date as YYYYMMDD */
function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** Get today in ISO format */
function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Format issue date (today) for display */
function formatIssueDate() {
  return formatThaiDate(getTodayISO());
}

/** Show toast notification */
function showToast(message, type = 'default', duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

/* ============================================================
   BOOKING NUMBER GENERATION
   ============================================================ */

/** Generate next booking number */
function generateBookingNo() {
  const dateStr = getTodayStr();
  const bookings = loadBookings();

  // Filter bookings created today
  const todayPrefix = `BK-${dateStr}-`;
  const todayBookings = bookings.filter(b => b.bookingNo && b.bookingNo.startsWith(todayPrefix));

  let nextSeq = 1;
  if (todayBookings.length > 0) {
    const seqs = todayBookings.map(b => {
      const parts = b.bookingNo.split('-');
      return parseInt(parts[parts.length - 1]) || 0;
    });
    nextSeq = Math.max(...seqs) + 1;
  }

  return `BK-${dateStr}-${String(nextSeq).padStart(3, '0')}`;
}

/* ============================================================
   LOCAL STORAGE CRUD
   ============================================================ */

function loadBookings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error loading bookings:', e);
    return [];
  }
}

function saveBookings(bookings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
    allBookings = bookings;
  } catch (e) {
    showToast('❌ เกิดข้อผิดพลาดในการบันทึก', 'error');
    console.error('Error saving bookings:', e);
  }
}

function saveBooking(data) {
  const bookings = loadBookings();
  const idx = bookings.findIndex(b => b.bookingNo === data.bookingNo);
  if (idx >= 0) {
    bookings[idx] = { ...bookings[idx], ...data, updatedAt: new Date().toISOString() };
  } else {
    bookings.push({ ...data, createdAt: new Date().toISOString() });
  }
  saveBookings(bookings);
  allBookings = bookings;
}

function deleteBooking(bookingNo) {
  const bookings = loadBookings().filter(b => b.bookingNo !== bookingNo);
  saveBookings(bookings);
}

/* ============================================================
   READ FORM DATA
   ============================================================ */

function getFormData() {
  const timeSlot = document.getElementById('timeSlot').value;
  let resolvedTimeSlot = timeSlot;
  if (timeSlot === 'กำหนดเอง') {
    const start = document.getElementById('timeStart').value || '00:00';
    const end = document.getElementById('timeEnd').value || '00:00';
    resolvedTimeSlot = `${start} – ${end} น.`;
  }

  const total = parseFloat(document.getElementById('totalAmount').value) || 0;
  const deposit = parseFloat(document.getElementById('deposit').value) || 0;
  const remaining = total - deposit;

  return {
    bookingNo: document.getElementById('bookingNoDisplay').textContent.trim(),
    customerName: document.getElementById('customerName').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    eventDate: document.getElementById('eventDate').value,
    location: document.getElementById('location').value.trim(),
    photographerPackage: document.getElementById('photographerPackage').value,
    scanOption: document.getElementById('scanOption').value,
    timeSlot: resolvedTimeSlot,
    gift: document.getElementById('gift').value,
    total,
    deposit,
    remaining,
  };
}

/* ============================================================
   POPULATE FORM FROM DATA
   ============================================================ */

function populateForm(data) {
  document.getElementById('bookingNoDisplay').textContent = data.bookingNo;
  document.getElementById('customerName').value = data.customerName || '';
  document.getElementById('phone').value = data.phone || '';
  document.getElementById('eventDate').value = data.eventDate || '';
  document.getElementById('location').value = data.location || '';

  setSelectValue('photographerPackage', data.photographerPackage);
  setSelectValue('scanOption', data.scanOption);
  setSelectValue('gift', data.gift);

  // Handle time slot
  const standardSlots = ['07.00-12.00 น.', '07.00-17.00 น.', '07.00-12.00 / 16.00-20.00 น.', '07.00-20.00 น.'];
  if (standardSlots.includes(data.timeSlot)) {
    setSelectValue('timeSlot', data.timeSlot);
    toggleCustomTime(false);
  } else {
    setSelectValue('timeSlot', 'กำหนดเอง');
    toggleCustomTime(true);
    // Parse custom time if possible
    if (data.timeSlot) {
      const parts = data.timeSlot.split('–').map(s => s.trim().replace(' น.', ''));
      if (parts.length === 2) {
        document.getElementById('timeStart').value = parts[0];
        document.getElementById('timeEnd').value = parts[1];
      }
    }
  }

  document.getElementById('totalAmount').value = data.total || '';
  document.getElementById('deposit').value = data.deposit || '';
  updateRemaining();
}

function setSelectValue(id, value) {
  const sel = document.getElementById(id);
  for (const opt of sel.options) {
    if (opt.value === value) {
      sel.value = value;
      return;
    }
  }
}

/* ============================================================
   LIVE PREVIEW UPDATE
   ============================================================ */

function updatePreview() {
  const data = getFormData();

  document.getElementById('pvBookingNo').textContent = data.bookingNo;
  document.getElementById('pvIssueDate').textContent = formatIssueDate();
  document.getElementById('pvCustomerName').textContent = data.customerName || '–';
  document.getElementById('pvPhone').textContent = data.phone || '–';
  document.getElementById('pvEventDate').textContent = data.eventDate ? formatThaiDate(data.eventDate) : '–';
  document.getElementById('pvLocation').textContent = data.location || '–';
  document.getElementById('pvPhotographer').textContent = data.photographerPackage;
  document.getElementById('pvScan').textContent = data.scanOption;
  document.getElementById('pvTime').textContent = data.timeSlot;
  document.getElementById('pvGift').textContent = data.gift;
  document.getElementById('pvTotal').textContent = formatCurrency(data.total);
  document.getElementById('pvDeposit').textContent = formatCurrency(data.deposit);
  document.getElementById('pvRemaining').textContent = formatCurrency(data.remaining);

  // Also update display in form
  document.getElementById('bookingNoDisplay').textContent = data.bookingNo;
}

/* ============================================================
   REMAINING CALCULATION
   ============================================================ */

function updateRemaining() {
  const total = parseFloat(document.getElementById('totalAmount').value) || 0;
  const deposit = parseFloat(document.getElementById('deposit').value) || 0;
  const remaining = total - deposit;
  document.getElementById('remainingDisplay').textContent = formatNumber(remaining);
}

/* ============================================================
   CUSTOM TIME SLOT
   ============================================================ */

function toggleCustomTime(show) {
  const g1 = document.getElementById('customTimeGroup');
  const g2 = document.getElementById('customTimeGroup2');
  g1.style.display = show ? 'flex' : 'none';
  g2.style.display = show ? 'flex' : 'none';
}

/* ============================================================
   FORM VALIDATION
   ============================================================ */

function validateForm() {
  const data = getFormData();
  const errors = [];

  if (!data.customerName) errors.push('ชื่อผู้จอง');
  if (!data.phone) errors.push('เบอร์ติดต่อ');
  if (!data.eventDate) errors.push('วันเดือนปีจัดงาน');
  if (!data.location) errors.push('สถานที่จัดงาน');

  if (errors.length > 0) {
    showToast(`⚠️ กรุณากรอก: ${errors.join(', ')}`, 'error', 4000);
    // Highlight empty required fields
    ['customerName', 'phone', 'eventDate', 'location'].forEach(id => {
      const el = document.getElementById(id);
      if (!el.value.trim()) {
        el.style.borderColor = '#EF4444';
        el.addEventListener('input', () => { el.style.borderColor = ''; }, { once: true });
      }
    });
    return false;
  }
  return true;
}

/* ============================================================
   SAVE BOOKING
   ============================================================ */

function handleSave() {
  if (!validateForm()) return;

  const data = getFormData();
  saveBooking(data);
  currentBookingId = data.bookingNo;

  // Update status badge
  const badge = document.querySelector('.status-badge');
  badge.className = 'status-badge status-saved';
  badge.textContent = 'บันทึกแล้ว';

  showToast('✅ บันทึกข้อมูลสำเร็จ', 'success');
}

/* ============================================================
   AUTO SAVE (Debounced)
   ============================================================ */

function triggerAutoSave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const data = getFormData();
    if (data.customerName || data.phone) {
      saveBooking(data);
    }
  }, AUTOSAVE_DELAY);
}

/* ============================================================
   SAVE AS JPG
   ============================================================ */

async function handleSaveJPG() {
  if (!validateForm()) return;

  const preview = document.getElementById('bookingPreview');
  showToast('⏳ กำลังสร้างรูปภาพ...', 'info');

  try {
    const canvas = await html2canvas(preview, {
      scale: 2.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: preview.scrollWidth,
      windowHeight: preview.scrollHeight,
    });

    const link = document.createElement('a');
    const data = getFormData();
    link.download = `${data.bookingNo}_ใบจอง.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
    showToast('📸 ดาวน์โหลดรูปภาพสำเร็จ', 'success');
  } catch (e) {
    showToast('❌ ไม่สามารถสร้างรูปภาพได้', 'error');
    console.error(e);
  }
}

/* ============================================================
   PRINT
   ============================================================ */

function handlePrint() {
  if (!validateForm()) return;
  window.print();
}

/* ============================================================
   CLEAR FORM
   ============================================================ */

function handleClear() {
  if (confirm('ต้องการล้างข้อมูลและสร้างใบจองใหม่หรือไม่?')) {
    clearForm();
  }
}

function clearForm() {
  document.getElementById('customerName').value = '';
  document.getElementById('phone').value = '';
  document.getElementById('eventDate').value = '';
  document.getElementById('location').value = '';
  document.getElementById('photographerPackage').selectedIndex = 0;
  document.getElementById('scanOption').selectedIndex = 0;
  document.getElementById('timeSlot').selectedIndex = 0;
  document.getElementById('gift').selectedIndex = 0;
  document.getElementById('totalAmount').value = '';
  document.getElementById('deposit').value = '';
  document.getElementById('remainingDisplay').textContent = '0';
  document.getElementById('timeStart').value = '09:00';
  document.getElementById('timeEnd').value = '17:00';
  toggleCustomTime(false);

  // Reset status badge
  const badge = document.querySelector('.status-badge');
  badge.className = 'status-badge status-new';
  badge.textContent = 'ใหม่';

  // Generate new booking number
  currentBookingId = null;
  const newNo = generateBookingNo();
  document.getElementById('bookingNoDisplay').textContent = newNo;

  updatePreview();
  showToast('🗑️ ล้างข้อมูลสำเร็จ สร้างใบจองใหม่แล้ว', 'default');

  // Scroll to top smoothly
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   BOOKING LIST MODAL
   ============================================================ */

function openModal() {
  allBookings = loadBookings();
  renderBookingList(allBookings);
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('open');
  document.getElementById('searchInput').focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function renderBookingList(bookings) {
  const body = document.getElementById('bookingListBody');

  if (bookings.length === 0) {
    body.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <p>ยังไม่มีรายการจอง</p>
      </div>`;
    return;
  }

  // Sort by createdAt desc
  const sorted = [...bookings].sort((a, b) => {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  body.innerHTML = sorted.map(b => `
    <div class="booking-card" data-no="${escapeHtml(b.bookingNo)}">
      <div class="booking-card-info">
        <div class="booking-card-no">${escapeHtml(b.bookingNo)}</div>
        <div class="booking-card-name">${escapeHtml(b.customerName || '–')}</div>
        <div class="booking-card-meta">
          <span>📞 ${escapeHtml(b.phone || '–')}</span>
          <span>📅 ${b.eventDate ? formatThaiDate(b.eventDate) : '–'}</span>
          <span>💰 ${formatCurrency(b.total)}</span>
          ${b.remaining > 0 ? `<span>⏳ คงเหลือ ${formatCurrency(b.remaining)}</span>` : '<span class="paid">✓ ชำระครบ</span>'}
        </div>
      </div>
      <div class="booking-card-actions">
        <button class="btn-sm edit" onclick="editBooking('${escapeHtml(b.bookingNo)}')">แก้ไข</button>
        <button class="btn-sm delete" onclick="confirmDelete('${escapeHtml(b.bookingNo)}')">ลบ</button>
      </div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function editBooking(bookingNo) {
  const bookings = loadBookings();
  const booking = bookings.find(b => b.bookingNo === bookingNo);
  if (!booking) return;

  closeModal();
  populateForm(booking);
  currentBookingId = bookingNo;

  // Update status badge
  const badge = document.querySelector('.status-badge');
  badge.className = 'status-badge status-saved';
  badge.textContent = 'แก้ไข';

  updatePreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast(`📝 โหลดใบจอง ${bookingNo} สำเร็จ`, 'info');
}

function confirmDelete(bookingNo) {
  if (confirm(`ต้องการลบใบจอง ${bookingNo} ใช่หรือไม่?\n\nการลบนี้ไม่สามารถกู้คืนได้`)) {
    deleteBooking(bookingNo);
    showToast('🗑️ ลบใบจองสำเร็จ', 'default');
    // Refresh list
    allBookings = loadBookings();
    renderBookingList(allBookings);

    // If current editing = deleted booking, clear form
    if (currentBookingId === bookingNo) {
      clearForm();
    }
  }
}

/* ============================================================
   SEARCH
   ============================================================ */

function handleSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderBookingList(allBookings);
    return;
  }

  const filtered = allBookings.filter(b =>
    (b.bookingNo || '').toLowerCase().includes(q) ||
    (b.customerName || '').toLowerCase().includes(q) ||
    (b.phone || '').toLowerCase().includes(q) ||
    (b.location || '').toLowerCase().includes(q)
  );

  renderBookingList(filtered);
}

/* ============================================================
   EXPORT / IMPORT JSON
   ============================================================ */

function exportJSON() {
  const bookings = loadBookings();
  if (bookings.length === 0) {
    showToast('⚠️ ยังไม่มีข้อมูลสำหรับ Export', 'error');
    return;
  }

  const json = JSON.stringify(bookings, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = getTodayStr();
  link.download = `SookJaiPix_Backup_${date}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`📦 Export สำเร็จ (${bookings.length} รายการ)`, 'success');
}

function importJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Invalid format');

      const existing = loadBookings();
      const existingNos = new Set(existing.map(b => b.bookingNo));
      let added = 0;

      data.forEach(b => {
        if (b.bookingNo && !existingNos.has(b.bookingNo)) {
          existing.push(b);
          added++;
        }
      });

      saveBookings(existing);
      showToast(`✅ Import สำเร็จ: เพิ่ม ${added} รายการ`, 'success');
    } catch (err) {
      showToast('❌ ไฟล์ JSON ไม่ถูกต้อง', 'error');
    }
    // Reset file input
    document.getElementById('importJSON').value = '';
  };
  reader.readAsText(file);
}

/* ============================================================
   INIT
   ============================================================ */

function init() {
  // Set initial booking number
  const initialBookingNo = generateBookingNo();
  document.getElementById('bookingNoDisplay').textContent = initialBookingNo;

  // Initial preview
  updatePreview();

  // Set today's issue date in preview
  document.getElementById('pvIssueDate').textContent = formatIssueDate();

  // ---- EVENT LISTENERS ----

  // All form inputs → live preview + autosave
  const liveInputs = [
    'customerName', 'phone', 'eventDate', 'location',
    'photographerPackage', 'scanOption', 'timeSlot', 'gift',
    'timeStart', 'timeEnd'
  ];

  liveInputs.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => { updatePreview(); triggerAutoSave(); });
    el.addEventListener('change', () => { updatePreview(); triggerAutoSave(); });
  });

  // Pricing inputs
  ['totalAmount', 'deposit'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      updateRemaining();
      updatePreview();
      triggerAutoSave();
    });
  });

  // Time slot custom toggle
  document.getElementById('timeSlot').addEventListener('change', (e) => {
    toggleCustomTime(e.target.value === 'กำหนดเอง');
    updatePreview();
  });

  // Buttons
  document.getElementById('btnSave').addEventListener('click', handleSave);
  document.getElementById('btnSaveJPG').addEventListener('click', handleSaveJPG);
  document.getElementById('btnPrint').addEventListener('click', handlePrint);
  document.getElementById('btnClear').addEventListener('click', handleClear);

  // Booking list modal
  document.getElementById('btnBookingList').addEventListener('click', openModal);
  document.getElementById('btnCloseModal').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Keyboard shortcut: Escape to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Search
  document.getElementById('searchInput').addEventListener('input', (e) => {
    handleSearch(e.target.value);
  });

  // Export / Import
  document.getElementById('btnExportJSON').addEventListener('click', exportJSON);
  document.getElementById('importJSON').addEventListener('change', (e) => {
    importJSON(e.target.files[0]);
  });

  // Phone input: numbers only
  document.getElementById('phone').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
  });

  // Online / Offline status indicator
  function updateOnlineStatus() {
    const badge = document.getElementById('offlineBadge');
    const dot = badge.querySelector('.offline-dot');
    if (navigator.onLine) {
      badge.innerHTML = `<span class="offline-dot" style="background:#F59E0B;"></span> ออนไลน์`;
    } else {
      badge.innerHTML = `<span class="offline-dot"></span> โหมดออฟไลน์`;
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  console.log('🎉 Sook Jai Pix initialized | Offline-First Mode');
}

// Boot
document.addEventListener('DOMContentLoaded', init);
