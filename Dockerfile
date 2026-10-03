FROM php:8.3-apache

RUN docker-php-ext-install pdo_mysql \
 && a2enmod headers rewrite \
 && { echo 'ServerTokens Prod'; echo 'ServerSignature Off'; } > /etc/apache2/conf-available/hardening.conf \
 && { echo '<Directory /var/www/html>'; echo '  AllowOverride All'; echo '</Directory>'; } >> /etc/apache2/conf-available/hardening.conf \
 && a2enconf hardening \
 && { echo 'upload_max_filesize=2M'; echo 'post_max_size=2M'; echo 'expose_php=Off'; echo 'display_errors=Off'; echo 'log_errors=On'; } > /usr/local/etc/php/conf.d/hd.ini

COPY public/ /var/www/html/
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh && chown -R www-data:www-data /var/www/html

# Railway injects $PORT; Apache must listen on it.
CMD ["/start.sh"]
