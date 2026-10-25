
import { useCallback, useEffect, useState } from "react";
import "./MedicinePurchase.css";

const API = "http://localhost:5000/api";

export default function MedicinePurchase() {
  const [medicines, setMedicines] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [payingId, setPayingId] = useState("");
  const [selectedItems, setSelectedItems] = useState({});
  const [checkoutOrder, setCheckoutOrder] = useState(null);
  const [processing, setProcessing] = useState(false);

  const token = localStorage.getItem("token");

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `Request failed (${response.status})`);
    }
    return data;
  }, [token]);

  const loadMedicines = useCallback(async () => {
    try {
      const data = await request("/medicines/prescribed");
      setMedicines(Array.isArray(data.medicines) ? data.medicines : []);
      setMessage("");
    } catch (error) {
      setMessage(`Unable to load prescription: ${error.message}`);
    }
  }, [request]);

  const loadOrders = useCallback(async () => {
    try {
      const data = await request("/medicine-orders/me");
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (error) {
      setMessage(`Unable to load orders: ${error.message}`);
    }
  }, [request]);

  useEffect(() => {
    loadMedicines();
    loadOrders();
  }, [loadMedicines, loadOrders]);

  async function loadSamplePrescription() {
    setLoading(true);
    setMessage("");
    try {
      const data = await request("/demo/medicines/seed-prescription", {
        method: "POST",
      });
      setMessage(data.message || "Sample prescription loaded.");
      await loadMedicines();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleMedicine(id) {
    setSelectedItems((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function changeQuantity(id, value) {
    const quantity = Math.max(1, Math.min(20, Number(value) || 1));
    setQuantities((current) => ({ ...current, [id]: quantity }));
  }

  const cart = medicines
    .filter((medicine) => selectedItems[medicine.id || medicine.medicineId])
    .map((medicine) => {
      const id = medicine.id || medicine.medicineId;
      return {
        medicineId: id,
        name: medicine.name || medicine.medicineName || id,
        price: Number(medicine.price || 0),
        quantity: quantities[id] || 1,
      };
    });

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  async function createOrder() {
    if (cart.length === 0) {
      setMessage("Select at least one prescribed medicine.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const data = await request("/medicine-orders", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map(({ medicineId, quantity }) => ({
            medicineId,
            quantity,
          })),
        }),
      });
      setCheckoutOrder(data.order || data);
      setMessage("Order created. Review it before simulated payment.");
      await loadOrders();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function payDemo(order) {
    const id = order.id || order.orderId;
    if (!id) {
      setMessage("Order ID is missing. Please create the order again.");
      return;
    }

    setPayingId(id);
    setProcessing(true);
    setMessage("Processing demo payment...");
    try {
      // Brief UI delay to demonstrate a payment-processing screen.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const data = await request(
        `/medicine-orders/${encodeURIComponent(id)}/pay-demo`,
        { method: "POST" }
      );
      setMessage(
        `${data.message || "Demo payment successful."}${
          data.reference ? ` Reference: ${data.reference}` : ""
        } No real money was charged.`
      );
      setCheckoutOrder(null);
      setSelectedItems({});
      await loadOrders();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPayingId("");
      setProcessing(false);
    }
  }

  function orderId(order) {
    return order.id || order.orderId || "—";
  }

  return (
    <section className="booking-panel medicine-panel">
      <h2>Medicine Purchase</h2>
      <p className="medicine-demo-note">
        Demo mode: payments are simulated. No real money is charged.
      </p>

      <button
        className="book-button"
        type="button"
        onClick={loadSamplePrescription}
        disabled={loading}
      >
        {loading ? "Loading..." : "Load Sample Prescription (Demo)"}
      </button>

      {message && (
        <p className="booking-message" role="status" aria-live="polite">
          {message}
        </p>
      )}

      <h3 className="medicine-subheading">Your prescribed medicines</h3>

      {medicines.length === 0 ? (
        <p>
          No prescription found yet. Click “Load Sample Prescription (Demo)”
          to load sample medicines for testing.
        </p>
      ) : (
        <div className="medicine-list">
          {medicines.map((medicine) => {
            const id = medicine.id || medicine.medicineId;
            const name = medicine.name || medicine.medicineName || id;
            const price = Number(medicine.price || 0);

            return (
              <article className="medicine-card" key={id}>
                <label className="medicine-select">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedItems[id])}
                    onChange={() => toggleMedicine(id)}
                  />
                  <span>
                    <strong>{name}</strong>
                    <small>Medicine ID: {id}</small>
                  </span>
                </label>

                <div className="medicine-price">
                  <strong>₹{price.toFixed(2)}</strong>
                  <label>
                    Qty
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={quantities[id] || 1}
                      onChange={(event) =>
                        changeQuantity(id, event.target.value)
                      }
                      disabled={!selectedItems[id]}
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="medicine-total">
        <span>Selected items: {cart.length}</span>
        <strong>Total: ₹{total.toFixed(2)}</strong>
      </div>

      <button
        className="book-button"
        type="button"
        onClick={createOrder}
        disabled={loading || cart.length === 0}
      >
        {loading ? "Creating order..." : "Proceed to Checkout"}
      </button>

      {checkoutOrder && (
        <div className="demo-checkout">
          <h3>Checkout</h3>
          <p>
            Order ID: <strong>{orderId(checkoutOrder)}</strong>
          </p>
          <p>
            Amount to pay:{" "}
            <strong>
              ₹{Number(checkoutOrder.total ?? total).toFixed(2)}
            </strong>
          </p>
          <p>This is a simulated payment. No card or bank details are needed.</p>
          <button
            className="book-button"
            type="button"
            onClick={() => payDemo(checkoutOrder)}
            disabled={processing}
          >
            {processing ? "Processing payment..." : "Pay Now (Demo)"}
          </button>
        </div>
      )}

      <h3 className="medicine-subheading">My medicine orders</h3>
      {orders.length === 0 ? (
        <p>No medicine orders yet.</p>
      ) : (
        <div className="medicine-list">
          {orders.map((order) => (
            <article className="medicine-card" key={orderId(order)}>
              <div>
                <strong>Order {orderId(order)}</strong>
                <p>
                  Amount: ₹{Number(order.total || 0).toFixed(2)}
                </p>
                <small>
                  Status: {order.paymentStatus || order.status || "Pending"}
                </small>
                {order.reference && (
                  <p>Transaction reference: {order.reference}</p>
                )}
              </div>
              {String(order.paymentStatus || "").toLowerCase() === "pending" && (
                <button
                  type="button"
                  className="medicine-pay-button"
                  onClick={() => payDemo(order)}
                  disabled={Boolean(payingId)}
                >
                  {payingId === orderId(order) ? "Processing..." : "Pay (Demo)"}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
