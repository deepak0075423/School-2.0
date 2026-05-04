// Sidebar toggle
const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('sidebarToggle');
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });
}

// Auto-dismiss flash messages
setTimeout(() => {
    document.querySelectorAll('.alert').forEach(el => {
        el.style.transition = 'opacity 0.5s ease';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 500);
    });
}, 5000);

// Alert close buttons
document.querySelectorAll('.alert-close').forEach(btn => {
    btn.addEventListener('click', () => {
        const alert = btn.closest('.alert');
        alert.style.opacity = '0';
        setTimeout(() => alert.remove(), 300);
    });
});

// Submit button loading state
document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', function (e) {
        if (e.defaultPrevented) return;
        const submitBtn = this.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner">⏳</span> Processing...';
        }
    });
});
