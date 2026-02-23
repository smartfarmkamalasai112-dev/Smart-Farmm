#!/usr/bin/env python3
"""
Flask Application Launcher with Python 3.13 + Eventlet Compatibility Fix

This script fixes the incompatibility between Eventlet 0.33.3 and Python 3.13
by applying necessary monkey-patches and workarounds BEFORE importing eventlet.
"""

import sys
import os

# STEP 1: Apply ssl.wrap_socket compatibility patch BEFORE eventlet import
import ssl
import weakref
import sys

# Fix for Python 3.13 where ssl.wrap_socket was removed
if not hasattr(ssl, 'wrap_socket'):
    def wrap_socket_compat(sock, keyfile=None, certfile=None, server_side=False, 
                           cert_reqs=ssl.CERT_NONE, ssl_version=ssl.PROTOCOL_TLS,
                           ca_certs=None, do_handshake_on_connect=True,
                           suppress_ragged_eofs=True, ciphers=None, **kwargs):
        """Compatibility wrapper for ssl.wrap_socket removed in Python 3.13"""
        try:
            context = ssl.create_default_context() if not server_side else ssl.SSLContext(ssl_version)
            if certfile:
                context.load_cert_chain(certfile, keyfile)
            if ca_certs:
                context.load_verify_locations(ca_certs)
            context.check_hostname = False
            context.verify_mode = cert_reqs
            return context.wrap_socket(sock, server_side=server_side, do_handshake_on_connect=do_handshake_on_connect)
        except Exception as e:
            # Fallback: return unwrapped socket
            print(f"Warning: SSL wrapping failed ({e}), continuing without SSL", file=sys.stderr)
            return sock
    
    ssl.wrap_socket = wrap_socket_compat

# STEP 2: Fix threading compatibility
import _thread
if not hasattr(_thread, 'start_joinable_thread'):
    # Python 3.13 added start_joinable_thread, but Eventlet doesn't know about it
    _thread.start_joinable_thread = _thread.start_new_thread

# STEP 3: Now safe to import eventlet
import eventlet
eventlet.monkey_patch()

# STEP 4: Import and run Flask
os.chdir(os.path.dirname(__file__) or '.')

if __name__ == '__main__':
    from app import app, socketio
    
    print("🚀 Flask-SocketIO Server Starting...")
    print(f"📍 Listening on http://0.0.0.0:5000")
    
    # Run Flask-SocketIO server
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=False,
        use_reloader=False,
        log_output=True
    )

