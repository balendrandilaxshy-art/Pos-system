import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { useCart } from '../CartContext';

export default function POS() {
    const [products, setProducts] = useState([]);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const { cart, addToCart, removeFromCart, updateQuantity, clearCart } = useCart();
    const navigate = useNavigate();

    useEffect(() => {
        API.get('/api/products').then((res) => setProducts(res.data));
    }, []);

    const showMessage = (msg) => {
        setMessage(msg);
        setError('');
        setTimeout(() => setMessage(''), 3000);
    };

    const handleAddToCart = (p) => {
        addToCart(p);
        showMessage(`✅ "${p.name}" added to cart!`);
    };

    const handleRemoveFromCart = (item) => {
        removeFromCart(item.id);
        showMessage(`🗑️ "${item.name}" removed from cart.`);
    };

    const total = cart.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);

    const handleCheckout = async () => {
        if (cart.length === 0) return;
        const idempotencyKey = crypto.randomUUID();
        const items = cart.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
        }));
        try {
            const res = await API.post('/api/checkout', { items, idempotencyKey });
            clearCart();
            navigate(`/checkout/${res.data.orderId}`);
        } catch (err) {
            setError('Checkout failed: ' + (err.response?.data?.error || err.message));
            setTimeout(() => setError(''), 4000);
        }
    };

    return (
        <div>
            <h1>🛒 POS — Point of Sale</h1>

            {message && <div className="card" style={{ background: '#166534', color: '#bbf7d0', padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px' }}>{message}</div>}
            {error && <div className="card" style={{ background: '#7f1d1d', color: '#fecaca', padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px' }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div>
                    <h3>Products</h3>
                    <div className="product-grid">
                        {products.map((p) => (
                            <div key={p.id} className="product-card">
                                <h3>{p.name}</h3>
                                <p className="price">Rs. {p.price}</p>
                                <p className="stock">{p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}</p>
                                <button onClick={() => handleAddToCart(p)} disabled={p.stock === 0}>
                                    Add
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card">
                    <h3>🛍️ Cart ({cart.length})</h3>
                    {cart.length === 0 ? (
                        <p style={{ color: '#94a3b8' }}>Cart is empty</p>
                    ) : (
                        <>
                            {cart.map((item) => (
                                <div key={item.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #334155' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <strong>{item.name}</strong>
                                        <span>Rs. {parseFloat(item.price) * item.quantity}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.3rem' }}>
                                        <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>-</button>
                                        <span className="qty">{item.quantity}</span>
                                        <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                                        <button className="danger" onClick={() => handleRemoveFromCart(item)} style={{ marginLeft: 'auto' }}>×</button>
                                    </div>
                                </div>
                            ))}
                            <div style={{ marginTop: '1rem', borderTop: '2px solid #a855f7', paddingTop: '1rem' }}>
                                <h2>Total: Rs. {total.toFixed(2)}</h2>
                                <button className="success" onClick={handleCheckout} style={{ width: '100%', padding: '0.75rem' }}>
                                    Checkout
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
