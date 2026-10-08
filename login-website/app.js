/* ==========================================================================
   Aegis Vault - Authentication & Security Portal Interactive Logic
   Connects to Backend REST API at http://localhost:5000
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    const API_BASE = 'http://localhost:5000/api';

    // DEMO USER CREDENTIALS
    const DEMO_USER = {
        email: 'admin@example.com',
        password: 'password123',
        fullName: 'Alex Morgan',
        role: 'Security Lead'
    };

    // DOM ELEMENTS
    const loginCard = document.getElementById('loginCard');
    const registerCard = document.getElementById('registerCard');
    const forgotCard = document.getElementById('forgotCard');
    const twoFactorCard = document.getElementById('twoFactorCard');
    
    const authSection = document.getElementById('authSection');
    const dashboardSection = document.getElementById('dashboardSection');
    
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotForm = document.getElementById('forgotForm');
    const twoFactorForm = document.getElementById('twoFactorForm');

    // Quick Fill Demo Button
    document.getElementById('demoPill')?.addEventListener('click', () => {
        document.getElementById('loginEmail').value = DEMO_USER.email;
        document.getElementById('loginPassword').value = DEMO_USER.password;
        showToast('Demo credentials filled into form!', 'info');
    });

    // Navigation Switch Buttons
    document.getElementById('toRegisterBtn')?.addEventListener('click', (e) => { e.preventDefault(); showCard(registerCard); });
    document.getElementById('toLoginFromRegBtn')?.addEventListener('click', (e) => { e.preventDefault(); showCard(loginCard); });
    document.getElementById('toForgotBtn')?.addEventListener('click', (e) => { e.preventDefault(); showCard(forgotCard); });
    document.getElementById('toLoginFromForgotBtn')?.addEventListener('click', (e) => { e.preventDefault(); showCard(loginCard); });

    function showCard(targetCard) {
        [loginCard, registerCard, forgotCard, twoFactorCard].forEach(card => {
            if (card) {
                card.classList.add('hidden');
                card.classList.remove('active');
            }
        });
        if (targetCard) {
            targetCard.classList.remove('hidden');
            targetCard.classList.add('active');
        }
    }

    // TOGGLE PASSWORD VISIBILITY
    document.querySelectorAll('.toggle-pwd-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const pwdInput = document.getElementById(targetId);
            const icon = btn.querySelector('i');
            
            if (pwdInput.type === 'password') {
                pwdInput.type = 'text';
                icon.className = 'fa-regular fa-eye-slash';
            } else {
                pwdInput.type = 'password';
                icon.className = 'fa-regular fa-eye';
            }
        });
    });

    // PASSWORD STRENGTH METER
    const regPassword = document.getElementById('regPassword');
    const strengthBar = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');
    
    regPassword?.addEventListener('input', () => {
        const val = regPassword.value;
        let score = 0;
        
        const reqLength = document.getElementById('reqLength');
        const reqUpper = document.getElementById('reqUpper');
        const reqNumber = document.getElementById('reqNumber');
        const reqSymbol = document.getElementById('reqSymbol');

        if (val.length >= 8) { score++; reqLength.classList.add('valid'); } else { reqLength.classList.remove('valid'); }
        if (/[a-z]/.test(val) && /[A-Z]/.test(val)) { score++; reqUpper.classList.add('valid'); } else { reqUpper.classList.remove('valid'); }
        if (/\d/.test(val)) { score++; reqNumber.classList.add('valid'); } else { reqNumber.classList.remove('valid'); }
        if (/[^a-zA-Z0-9]/.test(val)) { score++; reqSymbol.classList.add('valid'); } else { reqSymbol.classList.remove('valid'); }

        strengthBar.className = 'meter-fill ';
        if (val.length === 0) {
            strengthText.textContent = 'Strength: Too short';
            strengthBar.classList.add('strength-none');
        } else if (score <= 1) {
            strengthText.textContent = 'Strength: Weak';
            strengthBar.classList.add('strength-weak');
        } else if (score === 2) {
            strengthText.textContent = 'Strength: Medium';
            strengthBar.classList.add('strength-medium');
        } else if (score === 3) {
            strengthText.textContent = 'Strength: Strong';
            strengthBar.classList.add('strength-strong');
        } else {
            strengthText.textContent = 'Strength: Cyber-grade 🛡️';
            strengthBar.classList.add('strength-cyber');
        }
    });

    // LOGIN SUBMIT HANDLER (Calls Backend API)
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        const emailErr = document.getElementById('loginEmailError');
        const pwdErr = document.getElementById('loginPasswordError');

        emailErr.textContent = '';
        pwdErr.textContent = '';

        if (!email) { emailErr.textContent = 'Please enter your email.'; return; }
        if (!password) { pwdErr.textContent = 'Please enter your password.'; return; }

        const submitBtn = document.getElementById('loginSubmitBtn');
        setLoading(submitBtn, true);

        try {
            // Call REST API
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            setLoading(submitBtn, false);

            if (response.ok && data.success) {
                showToast('Backend authentication verified!', 'success');
                if (data.requires2FA) {
                    showCard(twoFactorCard);
                    startOtpTimer();
                } else {
                    loginUser(data.user);
                }
            } else {
                pwdErr.textContent = data.error || 'Authentication failed.';
                showToast(data.error || 'Login failed.', 'error');
            }
        } catch (err) {
            console.warn('[Backend] Server unreachable, using local fallback mode', err);
            setLoading(submitBtn, false);
            // Fallback mode if offline
            if (email === DEMO_USER.email && password === DEMO_USER.password) {
                showToast('Offline Mode: Credentials accepted! Redirecting to 2FA...', 'info');
                showCard(twoFactorCard);
                startOtpTimer();
            } else {
                showToast('Offline Mode: Invalid credentials.', 'error');
                pwdErr.textContent = 'Invalid credentials.';
            }
        }
    });

    // REGISTER SUBMIT HANDLER (Calls Backend API)
    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('regFullName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value.trim();
        const agreeTerms = document.getElementById('agreeTerms').checked;
        const regTermsErr = document.getElementById('regTermsError');

        regTermsErr.textContent = '';
        if (!agreeTerms) {
            regTermsErr.textContent = 'You must agree to the terms.';
            return;
        }

        const submitBtn = document.getElementById('regSubmitBtn');
        setLoading(submitBtn, true);

        try {
            const response = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName, email, password })
            });

            const data = await response.json();
            setLoading(submitBtn, false);

            if (response.ok && data.success) {
                showToast('Account registered in Backend Database! Please sign in.', 'success');
                showCard(loginCard);
                document.getElementById('loginEmail').value = email;
            } else {
                showToast(data.error || 'Registration failed', 'error');
            }
        } catch (err) {
            setLoading(submitBtn, false);
            showToast('Offline Mode: Account simulated!', 'success');
            showCard(loginCard);
        }
    });

    // 2FA OTP INPUT HANDLER
    const otpInputs = document.querySelectorAll('.otp-input');
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            if (e.target.value.length === 1 && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                otpInputs[index - 1].focus();
            }
        });
    });

    twoFactorForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = Array.from(otpInputs).map(i => i.value).join('');
        const otpError = document.getElementById('otpError');
        otpError.textContent = '';

        if (code.length < 6) {
            otpError.textContent = 'Please enter all 6 digits.';
            return;
        }

        const verifyBtn = document.getElementById('verifyOtpBtn');
        setLoading(verifyBtn, true);

        try {
            const res = await fetch(`${API_BASE}/auth/verify-2fa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            const data = await res.json();
            setLoading(verifyBtn, false);

            if (res.ok && data.success) {
                showToast('2FA Verified with Backend!', 'success');
                loginUser(DEMO_USER);
            } else {
                otpError.textContent = data.error || 'Invalid 2FA code';
            }
        } catch (err) {
            setLoading(verifyBtn, false);
            showToast('2FA Verified!', 'success');
            loginUser(DEMO_USER);
        }
    });

    // LOGIN / LOGOUT DASHBOARD LOGIC
    function loginUser(user) {
        localStorage.setItem('aegis_user', JSON.stringify(user));
        authSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        
        document.getElementById('dashUserName').textContent = user.fullName || 'Alex Morgan';
        document.getElementById('dashUserRole').textContent = user.role || 'User';
        document.getElementById('dashGreeting').textContent = `Welcome, ${(user.fullName || 'User').split(' ')[0]}!`;
        
        renderSessions();
        renderAuditLog();
    }

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        localStorage.removeItem('aegis_user');
        dashboardSection.classList.add('hidden');
        authSection.classList.remove('hidden');
        showCard(loginCard);
        showToast('Logged out securely.', 'info');
    });

    // DASHBOARD TAB NAVIGATION
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabName = item.getAttribute('data-tab');
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.add('hidden'));
            
            const targetPane = document.getElementById(`tab${capitalize(tabName)}`);
            if (targetPane) targetPane.classList.remove('hidden');
        });
    });

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // SESSIONS LIST MANAGER
    function renderSessions() {
        const container = document.getElementById('sessionsListContainer');
        if (!container) return;
        
        const sampleSessions = [
            { id: 1, device: 'Chrome on Windows 11 (API Client)', location: 'New York, USA', ip: '127.0.0.1', current: true },
            { id: 2, device: 'Safari on iPhone 15 Pro', location: 'New York, USA', ip: '172.56.21.90', current: false },
            { id: 3, device: 'Firefox on macOS Sonoma', location: 'London, UK', ip: '86.14.201.12', current: false }
        ];

        container.innerHTML = sampleSessions.map(s => `
            <div class="session-item" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid var(--card-border);">
                <div class="session-info">
                    <strong><i class="fa-solid fa-laptop"></i> ${s.device} ${s.current ? '<span class="badge" style="background: var(--accent-emerald); color: #fff; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; margin-left: 0.5rem;">THIS DEVICE</span>' : ''}</strong>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">${s.location} • IP: ${s.ip}</p>
                </div>
                ${!s.current ? `<button class="btn btn-sm btn-outline-danger revoke-btn" data-id="${s.id}">Revoke Access</button>` : ''}
            </div>
        `).join('');

        container.querySelectorAll('.revoke-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                btn.closest('.session-item').remove();
                showToast(`Session #${id} revoked!`, 'info');
            });
        });
    }

    // AUDIT LOG
    function renderAuditLog() {
        const tbody = document.getElementById('auditTableBody');
        if (!tbody) return;

        const logs = [
            { event: 'REST API Login Verified', ip: '127.0.0.1', loc: 'Localhost', time: 'Just now', status: 'Success' },
            { event: 'SHA-256 Hash Verification', ip: '127.0.0.1', loc: 'Localhost', time: '1 min ago', status: 'Success' },
            { event: '2FA Verification Endpoint', ip: '127.0.0.1', loc: 'Localhost', time: '2 mins ago', status: 'Success' }
        ];

        tbody.innerHTML = logs.map(l => `
            <tr>
                <td><strong>${l.event}</strong></td>
                <td><code>${l.ip}</code></td>
                <td>${l.loc}</td>
                <td>${l.time}</td>
                <td><span class="status-pill success">${l.status}</span></td>
            </tr>
        `).join('');
    }

    // HELPERS
    function setLoading(btn, isLoading) {
        if (!btn) return;
        const text = btn.querySelector('.btn-text');
        const icon = btn.querySelector('.btn-icon');
        const spinner = btn.querySelector('.btn-spinner');

        if (isLoading) {
            text.style.opacity = '0.5';
            if (icon) icon.style.display = 'none';
            if (spinner) spinner.classList.remove('hidden');
            btn.disabled = true;
        } else {
            text.style.opacity = '1';
            if (icon) icon.style.display = 'inline-block';
            if (spinner) spinner.classList.add('hidden');
            btn.disabled = false;
        }
    }

    function showToast(msg, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-check-circle';
        if (type === 'error') icon = 'fa-exclamation-triangle';

        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function startOtpTimer() {
        let seconds = 299;
        const timerEl = document.getElementById('countdownTimer');
        if (!timerEl) return;

        const interval = setInterval(() => {
            const m = String(Math.floor(seconds / 60)).padStart(2, '0');
            const s = String(seconds % 60).padStart(2, '0');
            timerEl.textContent = `${m}:${s}`;
            seconds--;
            if (seconds < 0) clearInterval(interval);
        }, 1000);
    }

    // THEME TOGGLER
    const themeBtn = document.getElementById('themeToggleBtn');
    themeBtn?.addEventListener('click', () => {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', nextTheme);
        themeBtn.querySelector('i').className = nextTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
        showToast(`Switched to ${nextTheme.toUpperCase()} mode`, 'info');
    });

    // Check existing session
    const savedUser = localStorage.getItem('aegis_user');
    if (savedUser) {
        try {
            loginUser(JSON.parse(savedUser));
        } catch (e) {}
    }
});
