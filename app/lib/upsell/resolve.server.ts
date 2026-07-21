import type { StorefrontApiContext } from "@shopify/shopify-app-react-router/server";

export type ResolvedVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  price: string;
  selectedOptions: { name: string; value: string }[];
};

export type ResolvedProduct = {
  id: string;
  title: string;
  handle: string;
  image: string | null;
  variants: ResolvedVariant[];
};

const PRODUCT_FIELDS = `
  id
  title
  handle
  featuredImage { url }
  variants(first: 25) {
    nodes {
      id
      title
      availableForSale
      price { amount currencyCode }
      selectedOptions { name value }
    }
  }
`;

const PRODUCTS_BY_ID_QUERY = `#graphql
  query UpsellProductsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product { ${PRODUCT_FIELDS} }
    }
  }
`;

const PRODUCTS_BY_COLLECTION_QUERY = `#graphql
  query UpsellProductsByCollection($id: ID!) {
    collection(id: $id) {
      products(first: 25) {
        nodes { ${PRODUCT_FIELDS} }
      }
    }
  }
`;

function toResolvedProduct(node: {
  id: string;
  title: string;
  handle: string;
  featuredImage?: { url: string } | null;
  variants: { nodes: { id: string; title: string; availableForSale: boolean; price: { amount: string }; selectedOptions: { name: string; value: string }[] }[] };
}): ResolvedProduct {
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    image: node.featuredImage?.url ?? null,
    variants: node.variants.nodes.map((v) => ({
      id: v.id,
      title: v.title,
      availableForSale: v.availableForSale,
      price: v.price.amount,
      selectedOptions: v.selectedOptions,
    })),
  };
}

// Products are looked up directly; collections are expanded to their product list.
// De-dupes by product id since a rule could reference overlapping products/collections.
export async function resolveTargets(
  storefront: StorefrontApiContext,
  targetType: "PRODUCT" | "COLLECTION",
  ids: string[],
): Promise<ResolvedProduct[]> {
  const byId = new Map<string, ResolvedProduct>();

  if (targetType === "PRODUCT") {
    if (ids.length === 0) return [];
    const response = await storefront.graphql(PRODUCTS_BY_ID_QUERY, { variables: { ids } });
    const json = (await response.json()) as { data?: { nodes: (Parameters<typeof toResolvedProduct>[0] | null)[] } };
    for (const node of json.data?.nodes ?? []) {
      if (!node) continue;
      const product = toResolvedProduct(node);
      byId.set(product.id, product);
    }
    return [...byId.values()];
  }

  await Promise.all(
    ids.map(async (collectionId) => {
      const response = await storefront.graphql(PRODUCTS_BY_COLLECTION_QUERY, {
        variables: { id: collectionId },
      });
      const json = (await response.json()) as {
        data?: { collection: { products: { nodes: Parameters<typeof toResolvedProduct>[0][] } } | null };
      };
      for (const node of json.data?.collection?.products.nodes ?? []) {
        const product = toResolvedProduct(node);
        byId.set(product.id, product);
      }
    }),
  );

  return [...byId.values()];
}
