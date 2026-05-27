const providers = {
  admitad: {
    name: "Admitad",
    async fetchCoupons() {
      return [];
    }
  },
  impact: {
    name: "Impact",
    async fetchCoupons() {
      return [];
    }
  },
  amazon: {
    name: "Amazon",
    async fetchCoupons() {
      return [];
    }
  },
  noon: {
    name: "Noon",
    async fetchCoupons() {
      return [];
    }
  }
};

function availableSources() {
  return Object.values(providers).map((provider) => provider.name);
}

async function importFromSource(source) {
  const key = String(source || "").trim().toLowerCase();
  const provider = providers[key];

  if (!provider) {
    const error = new Error(`Unsupported import source. Use: ${availableSources().join(", ")}.`);
    error.status = 400;
    throw error;
  }

  return {
    source: provider.name,
    coupons: await provider.fetchCoupons()
  };
}

module.exports = {
  availableSources,
  importFromSource
};
