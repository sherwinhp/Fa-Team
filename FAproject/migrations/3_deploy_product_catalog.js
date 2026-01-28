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
      priceEth: "0.18"
    },
    {
      name: "iPhone 15 Pro",
      description: "Flagship smartphone with titanium frame and pro-grade camera.",
      imageUrl: "/images/iphone.jpg",
      category: "Mobile",
      priceEth: "0.92"
    },
    {
      name: "Power Bank 20000mAh",
      description: "High-capacity portable charger with fast USB-C output.",
      imageUrl: "/images/powerbank.jpg",
      category: "Accessories",
      priceEth: "0.06"
    },
    {
      name: "Supreme Water Blaster",
      description: "Limited-run collector water blaster with Supreme branding.",
      imageUrl: "/images/supreme.jpg",
      category: "Collectibles",
      priceEth: "0.12"
    }
  ];

  for (const product of products) {
    const productId = web3.utils.keccak256(
      `${product.name}-${product.category}-${product.imageUrl}`
    );
    const priceWei = web3.utils.toWei(product.priceEth, "ether");
    await catalog.addProduct(
      productId,
      product.name,
      product.description,
      product.imageUrl,
      product.category,
      priceWei,
      { from: admin }
    );
  }
};
