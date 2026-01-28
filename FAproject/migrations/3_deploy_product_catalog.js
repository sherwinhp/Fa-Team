const ProductCatalog = artifacts.require("ProductCatalog");

module.exports = async function (deployer, _network, accounts) {
  await deployer.deploy(ProductCatalog);
  const catalog = await ProductCatalog.deployed();
  const admin = accounts && accounts.length ? accounts[0] : null;

  if (!admin) {
    return;
  }

  const products = [
    {
      name: "AirPods Pro Gen 2",
      description: "Noise-canceling earbuds with spatial audio and long battery life.",
      imageUrl: "/images/airpods.jpg",
      category: "Audio",
      priceEth: "0.18",
      stock: 32,
      fullDescription: "Compact premium earbuds with adaptive noise control, clear voice calls, and all-day comfort for travel or work.",
      features: ["Adaptive noise control", "Spatial audio with head tracking", "MagSafe charging case", "Sweat and water resistant"],
      specs: [
        { label: "Battery", value: "Up to 6 hours (earbuds)" },
        { label: "Case", value: "USB-C + wireless charging" },
        { label: "Connectivity", value: "Bluetooth 5.x" },
        { label: "Color", value: "White" }
      ]
    },
    {
      name: "iPhone 15 Pro",
      description: "Flagship smartphone with titanium frame and pro-grade camera.",
      imageUrl: "/images/iphone.jpg",
      category: "Mobile",
      priceEth: "0.92",
      stock: 18,
      fullDescription: "A premium smartphone with a bright display, fast performance, and advanced camera system for creators.",
      features: ["A17 Pro performance", "Pro camera system", "Titanium design", "All-day battery life"],
      specs: [
        { label: "Display", value: "6.1-inch OLED" },
        { label: "Storage", value: "256GB" },
        { label: "Camera", value: "48MP main" },
        { label: "Color", value: "Natural Titanium" }
      ]
    },
    {
      name: "Power Bank 20000mAh",
      description: "High-capacity portable charger with fast USB-C output.",
      imageUrl: "/images/powerbank.jpg",
      category: "Accessories",
      priceEth: "0.06",
      stock: 60,
      fullDescription: "Reliable travel power with dual outputs, fast charging, and LED battery indicators.",
      features: ["20000mAh capacity", "USB-C PD fast charge", "Dual output ports", "LED battery display"],
      specs: [
        { label: "Capacity", value: "20000mAh" },
        { label: "Output", value: "USB-C PD + USB-A" },
        { label: "Charging", value: "Fast charge support" },
        { label: "Color", value: "Midnight Blue" }
      ]
    },
    {
      name: "Supreme Water Blaster",
      description: "Limited-run collector water blaster with Supreme branding.",
      imageUrl: "/images/supreme.jpg",
      category: "Collectibles",
      priceEth: "0.12",
      stock: 14,
      fullDescription: "Streetwear-inspired collector item with premium packaging and verified authenticity.",
      features: ["Limited edition release", "Authenticity verified", "Premium packaging", "Display-ready finish"],
      specs: [
        { label: "Edition", value: "Limited Run" },
        { label: "Material", value: "ABS plastic" },
        { label: "Color", value: "Red" },
        { label: "Includes", value: "Display stand" }
      ]
    }
  ];

  for (const product of products) {
    const productId = web3.utils.keccak256(
      `${product.name}-${product.category}-${product.imageUrl}`
    );
    const priceWei = web3.utils.toWei(product.priceEth, "ether");
    const specLabels = product.specs.map((spec) => spec.label);
    const specValues = product.specs.map((spec) => spec.value);
    await catalog.addProduct(
      productId,
      product.name,
      product.description,
      product.imageUrl,
      product.category,
      priceWei,
      admin,
      "TrustedLedger Store",
      product.stock,
      0,
      product.fullDescription,
      product.features,
      specLabels,
      specValues,
      { from: admin }
    );
  }
};
