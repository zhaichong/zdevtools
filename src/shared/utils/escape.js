	/**
	 * HTML 转义，防止 XSS
	 * @param {*} value
	 * @returns {string}
	 */
	export function escapeHtml(value) {
	    return String(value ?? '').replace(/[&<>"']/g, char => ({
	        '&': '&amp;',
	        '<': '&lt;',
	        '>': '&gt;',
	        '"': '&quot;',
	        "'": '&#039;'
	    }[char]));
	}
