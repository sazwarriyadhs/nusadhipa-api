import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../config/theme.dart';
import '../../services/api_service.dart';
import 'checkout_screen.dart';

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final ApiService _api = ApiService();

  final NumberFormat _currencyFormat = NumberFormat('#,##0', 'id_ID');

  List<dynamic> _cartItems = [];

  final Set<String> _busyItemIds = {};

  bool _loading = true;
  bool _checkoutLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadCart();
  }

  int _toInt(dynamic value, {int fallback = 0}) {
    if (value is int) return value;
    if (value is num) return value.toInt();

    if (value is String) {
      final parsed = num.tryParse(value.trim());
      return parsed?.toInt() ?? fallback;
    }

    return fallback;
  }

  double _toDouble(dynamic value, {double fallback = 0}) {
    if (value is num) return value.toDouble();

    if (value is String) {
      final parsed = num.tryParse(value.trim());
      return parsed?.toDouble() ?? fallback;
    }

    return fallback;
  }

  String _itemKey(dynamic id) => id?.toString() ?? '';

  int _quantity(dynamic item) {
    if (item is! Map) return 0;
    return _toInt(item['quantity'], fallback: 0);
  }

  double _price(dynamic item) {
    if (item is! Map) return 0;

    return _toDouble(
      item['price'] ?? item['unit_price'] ?? item['selling_price'],
    );
  }

  int get _totalItems {
    return _cartItems.fold<int>(0, (sum, item) => sum + _quantity(item));
  }

  double get _totalPrice {
    return _cartItems.fold<double>(
      0,
      (sum, item) => sum + (_price(item) * _quantity(item)),
    );
  }

  bool get _hasBusyItems => _busyItemIds.isNotEmpty;

  Future<void> _loadCart({bool showLoading = true}) async {
    if (showLoading && mounted) {
      setState(() {
        _loading = true;
        _errorMessage = null;
      });
    }

    try {
      final items = await _api.getCart();

      if (!mounted) return;

      setState(() {
        _cartItems = items;
        _loading = false;
        _errorMessage = null;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _loading = false;
        _errorMessage = e.toString();
      });
    }
  }

  void _showMessage(String message, {bool isError = false}) {
    if (!mounted) return;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: isError
              ? Colors.red.shade700
              : const Color(0xFF334155),
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  Future<void> _removeItem(dynamic cartItemId) async {
    final key = _itemKey(cartItemId);

    if (key.isEmpty || _busyItemIds.contains(key)) return;

    setState(() => _busyItemIds.add(key));

    try {
      await _api.removeFromCart(cartItemId);

      if (!mounted) return;

      setState(() {
        _cartItems.removeWhere((item) => _itemKey(item['id']) == key);
      });

      _showMessage('Produk berhasil dihapus.');
    } catch (e) {
      _showMessage('Gagal menghapus produk: $e', isError: true);
      await _loadCart(showLoading: false);
    } finally {
      if (mounted) {
        setState(() => _busyItemIds.remove(key));
      }
    }
  }

  Future<void> _changeQuantity(Map item, int newQuantity) async {
    final cartItemId = item['id'];
    final key = _itemKey(cartItemId);
    final oldQuantity = _quantity(item);

    if (key.isEmpty || _busyItemIds.contains(key)) return;

    if (newQuantity < 1) {
      await _removeItem(cartItemId);
      return;
    }

    if (newQuantity == oldQuantity) return;

    setState(() => _busyItemIds.add(key));

    try {
      await _api.updateCartItem(cartItemId, newQuantity);

      if (!mounted) return;

      await _loadCart(showLoading: false);

      if (mounted) {
        _showMessage('Jumlah produk diperbarui.');
      }
    } catch (e) {
      if (mounted) {
        _showMessage(
          'Gagal memperbarui jumlah: ${e.toString()}',
          isError: true,
        );
        await _loadCart(showLoading: false);
      }
    } finally {
      if (mounted) {
        setState(() => _busyItemIds.remove(key));
      }
    }
  }

  Future<void> _openCheckout() async {
    if (_loading || _checkoutLoading || _hasBusyItems || _cartItems.isEmpty) {
      return;
    }

    setState(() => _checkoutLoading = true);

    try {
      final result = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) =>
              CheckoutScreen(cartItems: List<dynamic>.from(_cartItems)),
        ),
      );

      if (!mounted) return;

      if (result == true) {
        await _loadCart();
      }
    } catch (e) {
      _showMessage('Gagal membuka checkout: $e', isError: true);
    } finally {
      if (mounted) {
        setState(() => _checkoutLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            if (_loading)
              const Expanded(
                child: Center(
                  child: CircularProgressIndicator(color: brandRed),
                ),
              )
            else if (_cartItems.isEmpty && _errorMessage != null)
              Expanded(child: _buildErrorState())
            else if (_cartItems.isEmpty)
              Expanded(child: _buildEmptyState())
            else
              Expanded(child: _buildCartList()),
            if (!_loading && _cartItems.isNotEmpty) _buildBottomBar(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  'Keranjang',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Produk yang akan dibeli',
                  style: TextStyle(fontSize: 14, color: Colors.white70),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Muat ulang keranjang',
            onPressed: _loading ? null : () => _loadCart(),
            icon: const Icon(Icons.refresh, color: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: brandRed.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.shopping_cart_outlined,
                size: 64,
                color: brandRed,
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Keranjang Kosong',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Yuk mulai belanja dari UMKM lokal!',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: Colors.white70),
            ),
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: () => _loadCart(),
              icon: const Icon(Icons.refresh),
              label: const Text('Muat ulang'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: const BorderSide(color: brandRed),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.cloud_off_outlined,
              size: 60,
              color: Colors.orangeAccent,
            ),
            const SizedBox(height: 16),
            const Text(
              'Keranjang gagal dimuat',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              _errorMessage ?? 'Terjadi kesalahan.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: () => _loadCart(),
              icon: const Icon(Icons.refresh),
              label: const Text('Coba lagi'),
              style: ElevatedButton.styleFrom(
                backgroundColor: brandRed,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProductImage(dynamic imageUrl) {
    final url = imageUrl?.toString().trim() ?? '';

    final uri = Uri.tryParse(url);
    final validUrl =
        uri != null &&
        (uri.scheme == 'https' || uri.scheme == 'http') &&
        uri.host.isNotEmpty;

    return Container(
      width: 76,
      height: 76,
      color: Colors.grey.shade800,
      child: validUrl
          ? Image.network(
              url,
              fit: BoxFit.cover,
              errorBuilder: (_, error, stackTrace) => _imagePlaceholder(),
            )
          : _imagePlaceholder(),
    );
  }

  Widget _imagePlaceholder() {
    return const Center(
      child: Icon(Icons.image_outlined, color: Colors.white54, size: 30),
    );
  }

  Widget _buildCartList() {
    return RefreshIndicator(
      color: brandRed,
      onRefresh: () => _loadCart(showLoading: false),
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
        itemCount: _cartItems.length,
        itemBuilder: (context, index) {
          final rawItem = _cartItems[index];

          if (rawItem is! Map) {
            return const SizedBox.shrink();
          }

          final item = rawItem;
          final price = _price(item);
          final qty = _quantity(item);
          final name =
              (item['product_name'] ??
                      item['name'] ??
                      item['variant_name'] ??
                      'Produk')
                  .toString();

          final businessName = (item['business_name'] ?? 'UMKM').toString();

          final cartId = item['id'];
          final key = _itemKey(cartId);
          final busy = _busyItemIds.contains(key);

          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
            ),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: _buildProductImage(item['image_url']),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Row(
                        children: [
                          const Icon(
                            Icons.storefront,
                            color: brandRed,
                            size: 13,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              businessName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 10,
                                color: Colors.white70,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 7),
                      Text(
                        'Rp ${_currencyFormat.format(price)}',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          color: Colors.greenAccent,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                Column(
                  children: [
                    IconButton(
                      tooltip: 'Hapus produk',
                      onPressed: busy || cartId == null
                          ? null
                          : () => _removeItem(cartId),
                      icon: const Icon(
                        Icons.delete_outline,
                        color: Colors.redAccent,
                        size: 21,
                      ),
                    ),
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.black26,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _quantityButton(
                            icon: Icons.remove,
                            enabled: !busy && qty > 0,
                            onPressed: () => _changeQuantity(item, qty - 1),
                          ),
                          SizedBox(
                            width: 26,
                            child: Center(
                              child: busy
                                  ? const SizedBox(
                                      width: 13,
                                      height: 13,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : Text(
                                      '$qty',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13,
                                        color: Colors.white,
                                      ),
                                    ),
                            ),
                          ),
                          _quantityButton(
                            icon: Icons.add,
                            enabled: !busy && qty > 0,
                            onPressed: () => _changeQuantity(item, qty + 1),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _quantityButton({
    required IconData icon,
    required bool enabled,
    required VoidCallback onPressed,
  }) {
    return IconButton(
      onPressed: enabled ? onPressed : null,
      icon: Icon(
        icon,
        size: 16,
        color: enabled ? Colors.white : Colors.white30,
      ),
      constraints: const BoxConstraints(minWidth: 30, minHeight: 30),
      padding: EdgeInsets.zero,
      visualDensity: VisualDensity.compact,
    );
  }

  Widget _buildBottomBar() {
    final canCheckout =
        !_loading &&
        !_checkoutLoading &&
        !_hasBusyItems &&
        _cartItems.isNotEmpty;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Text(
                'Total ($_totalItems item)',
                style: const TextStyle(fontSize: 12, color: Colors.white70),
              ),
              const Spacer(),
              Text(
                'Rp ${_currencyFormat.format(_totalPrice)}',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  color: Colors.greenAccent,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: canCheckout ? _openCheckout : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: brandRed,
                disabledBackgroundColor: Colors.grey.shade700,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _checkoutLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Checkout',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
