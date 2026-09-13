import { Routes, Route, Link } from 'react-router-dom';
import Products from './pages/Products';
import POS from './pages/POS';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';
import { useCart } from './CartContext';

function App() {
  const { cart } = useCart();

  return (
    <div className="app">
      <nav className="navbar">
        <Link to="/" className="logo">🏪 Techloom POS</Link>
        <div className="nav-links">
          <Link to="/">Products</Link>
          <Link to="/pos">POS</Link>
          <Link to="/orders">Orders</Link>
          <Link to="/cart">Cart ({cart.length})</Link>
        </div>
      </nav>

      <div className="container">
        <Routes>
          <Route path="/" element={<Products />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/cart" element={<POS />} />
          <Route path="/checkout/:orderId" element={<Checkout />} />
          <Route path="/orders" element={<Orders />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
