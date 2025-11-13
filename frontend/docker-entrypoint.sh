#!/bin/sh
set -e

# Set secure default values for environment variables
export HSTS_MAX_AGE="${HSTS_MAX_AGE:-31536000}"
export CSP_SCRIPT_SRC="${CSP_SCRIPT_SRC:-'self' 'unsafe-inline' https://fonts.googleapis.com}"
export CSP_STYLE_SRC="${CSP_STYLE_SRC:-'self' 'unsafe-inline' https://fonts.googleapis.com}"
export CSP_IMG_SRC="${CSP_IMG_SRC:-'self' data: https:}"
export CSP_FONT_SRC="${CSP_FONT_SRC:-'self' https://fonts.gstatic.com}"
export CSP_CONNECT_SRC="${CSP_CONNECT_SRC:-'self'}"
export PERMISSIONS_POLICY="${PERMISSIONS_POLICY:-autoplay=(), fullscreen=(self), accelerometer=(), camera=(), cross-origin-isolated=(), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), keyboard-map=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), xr-spatial-tracking=()}"
export REFERRER_POLICY="${REFERRER_POLICY:-strict-origin-when-cross-origin}"

# Substitute environment variables in nginx.conf.template
envsubst '${HSTS_MAX_AGE} ${CSP_SCRIPT_SRC} ${CSP_STYLE_SRC} ${CSP_IMG_SRC} ${CSP_FONT_SRC} ${CSP_CONNECT_SRC} ${PERMISSIONS_POLICY} ${REFERRER_POLICY}' \
  < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Start nginx
exec nginx -g 'daemon off;'
