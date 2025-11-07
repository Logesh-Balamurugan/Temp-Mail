// Minimal temp-mail behavior: generate email, copy, refresh, delete, timer, simulated inbox

(function () {
	// Config
	const LIFETIME_SECONDS = 10 * 60; // 10 minutes
	const INCOMING_INTERVAL_MS = 20000; // simulated incoming every 20s

	// State
	let email = '';
	let secondsLeft = LIFETIME_SECONDS;
	let timerInterval = null;
	let incomingInterval = null;
	let emails = [];
	let password = '';

	// DOM refs (assigned in init)
	let emailDisplay = null;
	let timerEl = null;
	let emailList = null;
	let timerProgress = null;
	let messageCount = null;
	let modal = null;
	let modalSubject = null;
	let modalTime = null;
	let modalBody = null;
	let modalClose = null;
	let toastEl = null;
	let passwordDisplay = null; // new

	// Utilities
	function randString(len = 8) {
		const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		let s = '';
		for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
		return s;
	}

	// new password generator (stronger, with symbols)
	function generatePassword(len = 14) {
		const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}<>?';
		let out = '';
		for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
		return out;
	}

	function pickDomain() {
		const domains = ['@temp-mail.org', '@mail-temp.net', '@gettmp.io'];
		return domains[Math.floor(Math.random() * domains.length)];
	}

	function escapeHtml(str) {
		return String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
	}

	function showToast(msg, ms = 2200) {
		if (!toastEl) { alert(msg); return; }
		toastEl.textContent = msg;
		toastEl.classList.add('show');
		clearTimeout(toastEl._timeout);
		toastEl._timeout = setTimeout(() => toastEl.classList.remove('show'), ms);
	}

	function renderEmail() {
		if (!emailDisplay) return;
		emailDisplay.textContent = email || '—';
		emailDisplay.title = email || '';
	}

	function renderPassword() {
		if (!passwordDisplay) return;
		passwordDisplay.textContent = password || '—';
		passwordDisplay.title = password || '';
	}

	function renderTimer() {
		if (!timerEl) return;
		if (!secondsLeft || secondsLeft <= 0) {
			timerEl.textContent = 'Expired';
		} else {
			const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
			const s = (secondsLeft % 60).toString().padStart(2, '0');
			timerEl.textContent = `Expires in ${m}:${s}`;
		}
		if (timerProgress) {
			const pct = Math.max(0, Math.min(100, Math.round((secondsLeft / LIFETIME_SECONDS) * 100)));
			timerProgress.style.width = pct + '%';
		}
	}

	function renderInbox() {
		if (!emailList) return;
		emailList.innerHTML = '';
		if (emails.length === 0) {
			const li = document.createElement('li');
			li.textContent = 'No messages';
			emailList.appendChild(li);
			updateMessageCount();
			return;
		}
		for (let i = emails.length - 1; i >= 0; i--) {
			const msg = emails[i];
			const li = document.createElement('li');
			li.innerHTML = `<div><div class="subject">${escapeHtml(msg.subject)}</div><div class="snippet">${escapeHtml(msg.body.slice(0, 140))}</div></div><div class="meta">${escapeHtml(msg.time)}</div>`;
			li.addEventListener('click', () => showMessage(msg));
			emailList.appendChild(li);
		}
		updateMessageCount();
	}

	function updateMessageCount() {
		if (!messageCount) return;
		messageCount.textContent = `${emails.length} message${emails.length === 1 ? '' : 's'}`;
	}

	// Actions
	window.copyEmail = async function copyEmail() {
		if (!email) return showToast('No email to copy.');
		try {
			await navigator.clipboard.writeText(email);
			showToast('Email copied to clipboard');
		} catch (e) {
			// fallback
			const ta = document.createElement('textarea');
			ta.value = email;
			document.body.appendChild(ta);
			ta.select();
			try { document.execCommand('copy'); } catch (_) {}
			document.body.removeChild(ta);
			showToast('Email copied (fallback)');
		}
	};

	window.copyPassword = async function copyPassword() {
		if (!password) return showToast ? showToast('No password to copy.') : alert('No password to copy.');
		try {
			await navigator.clipboard.writeText(password);
			if (showToast) showToast('Password copied to clipboard');
			else alert('Password copied');
		} catch (e) {
			// fallback
			const ta = document.createElement('textarea');
			ta.value = password;
			document.body.appendChild(ta);
			ta.select();
			try { document.execCommand('copy'); } catch (_) {}
			document.body.removeChild(ta);
			if (showToast) showToast('Password copied (fallback)');
			else alert('Password copied (fallback)');
		}
	};

	window.refreshEmail = function refreshEmail() {
		generateEmail();
		showToast('New temporary address generated');
	};

	window.deleteEmail = function deleteEmail() {
		if (!email) return showToast('No temporary email to delete.');
		stopTimer();
		stopIncoming();
		email = '';
		emails = [];
		secondsLeft = 0;
		renderEmail();
		renderTimer();
		renderInbox();
		showToast('Temporary email deleted.');
	};

	// Update generateEmail to also create password
	function generateEmail() {
		email = `${randString(10)}${pickDomain()}`;
		password = generatePassword(14);
		secondsLeft = LIFETIME_SECONDS;
		emails = []; // clear old messages
		renderEmail();
		renderPassword();
		renderTimer();
		startTimer();
		startIncoming();
		renderInbox();
	}

	// Timer
	function startTimer() {
		stopTimer();
		timerInterval = setInterval(() => {
			secondsLeft--;
			if (secondsLeft <= 0) {
				stopTimer();
				stopIncoming();
				secondsLeft = 0;
				renderTimer();
				showToast('Temporary email expired.', 3000);
				return;
			}
			renderTimer();
		}, 1000);
	}

	function stopTimer() {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	}

	function resetTimer() {
		secondsLeft = LIFETIME_SECONDS;
		renderTimer();
	}

	// Simulated incoming messages
	function startIncoming() {
		stopIncoming();
		if (!email) return;
		incomingInterval = setInterval(() => {
			// 50% chance to skip to avoid too many messages
			if (Math.random() < 0.5) return;
			if (!email) return;
			const subjList = ['Welcome', 'Verify your account', 'Your receipt', 'Hello from Service'];
			const subj = subjList[Math.floor(Math.random() * subjList.length)];
			const body = `${subj} — This is a simulated message for ${email}. Time: ${new Date().toLocaleTimeString()}`;
			emails.push({ subject: subj, body, time: new Date().toLocaleTimeString() });
			renderInbox();
			showToast('New message received', 1400);
		}, INCOMING_INTERVAL_MS);
	}

	function stopIncoming() {
		if (incomingInterval) {
			clearInterval(incomingInterval);
			incomingInterval = null;
		}
	}

	// Modal handling
	function showMessage(msg) {
		if (!modal || !modalSubject || !modalBody || !modalTime) {
			return alert(`${msg.subject}\n\n${msg.body}`);
		}
		modalSubject.textContent = msg.subject;
		modalTime.textContent = msg.time;
		modalBody.textContent = msg.body;
		modal.setAttribute('aria-hidden', 'false');
		modal.classList.add('open');
	}

	function hideModal() {
		if (!modal) return;
		modal.setAttribute('aria-hidden', 'true');
		modal.classList.remove('open');
	}

	// Init
	function init() {
		// assign DOM refs now that DOM is ready
		emailDisplay = document.getElementById('emailDisplay');
		timerEl = document.getElementById('timer');
		emailList = document.getElementById('emailList');
		timerProgress = document.getElementById('timerProgress');
		messageCount = document.getElementById('messageCount');
		modal = document.getElementById('messageModal');
		modalSubject = document.getElementById('modalSubject');
		modalTime = document.getElementById('modalTime');
		modalBody = document.getElementById('modalBody');
		modalClose = document.getElementById('modalClose');
		toastEl = document.getElementById('toast');
		passwordDisplay = document.getElementById('passwordDisplay'); // new

		// defensive checks
		if (!emailDisplay || !timerEl || !emailList) {
			console.warn('Required DOM elements missing. script.js initialization aborted.');
			return;
		}

		// wire modal close
		if (modalClose) modalClose.addEventListener('click', hideModal);
		if (modal) {
			modal.addEventListener('click', (e) => {
				if (e.target === modal) hideModal();
			});
		}

		// start with a fresh generated email + password
		generateEmail();
		renderInbox();
	}

	// Ensure init runs even if script is deferred or loaded after DOMContentLoaded
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
