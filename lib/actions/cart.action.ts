"use server";
import { cookies } from "next/headers";
import { CartItem } from "@/types";
import { convertToPlainObject, formatError, round2 } from "../utils";
import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { cartItemSchema, insertCartSchema } from "../validator";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

/**
 * Calculate cart prices based on items
 */
const calcPrice = (items: CartItem[]) => {
  const itemsPrice = round2(
    items.reduce((acc, item) => acc + Number(item.price) * item.qty, 0)
  );
  const shippingPrice = round2(itemsPrice > 100 ? 0 : 100);
  const taxPrice = round2(itemsPrice * 0.15);
  const totalPrice = round2(itemsPrice + shippingPrice + taxPrice);

  return {
    itemsPrice: itemsPrice.toFixed(2),
    shippingPrice: shippingPrice.toFixed(2),
    taxPrice: taxPrice.toFixed(2),
    totalPrice: totalPrice.toFixed(2),
  };
};

/**
 * Get session information for cart
 */
const getCartSession = async () => {
  const sessionCartId = (await cookies()).get("sessionCartId")?.value;
  if (!sessionCartId) throw new Error("Cart session not found");

  const session = await auth();
  const userId = session?.user?.id as string | undefined;

  return { sessionCartId, userId };
};

/**
 * Check if product has enough stock for requested quantity
 */
const checkProductStock = (productStock: number, requestedQty: number) => {
  if (productStock < requestedQty) {
    throw new Error("Not enough stock");
  }
};

/**
 * Update cart with new price calculations
 */
const updateCartPrices = async (cartId: string, items: CartItem[]) => {
  return prisma.cart.update({
    where: { id: cartId },
    data: {
      items: items as Prisma.CartUpdateitemsInput[],
      ...calcPrice(items),
    },
  });
};

export async function addItemToCart(data: CartItem) {
  try {
    // Get session information
    const { sessionCartId, userId } = await getCartSession();

    // Parse and validate item
    const item = cartItemSchema.parse(data);

    // Find product in database
    const product = await prisma.product.findFirst({
      where: { id: item.productId },
    });

    if (!product) throw new Error("Product not found");

    // Get cart or handle new cart creation
    const cart = await getMyCart();
    console.log(cart);

    if (!cart) {
      // Create new cart
      const newCart = insertCartSchema.parse({
        userId,
        sessionCartId,
        items: [item],
        ...calcPrice([item]),
      });

      await prisma.cart.create({
        data: newCart,
      });

      revalidatePath(`/products/${product.slug}`);
      return {
        success: true,
        message: `${product.name} added to cart`,
      };
    }

    // Handle existing cart
    const existItem = (cart.items as CartItem[]).find(
      (x) => x.productId === item.productId
    );

    if (existItem) {
      // Update existing item quantity
      const newQty = existItem.qty + 1;
      checkProductStock(product.stock, newQty);

      existItem.qty = newQty;
    } else {
      // Add new item to cart
      checkProductStock(product.stock, 1);
      cart.items.push(item);
    }

    // Update cart with new items and prices
    await updateCartPrices(cart.id, cart.items as CartItem[]);

    revalidatePath(`/products/${product.slug}`);

    return {
      success: true,
      message: `${product.name} ${existItem ? "updated in" : "added to"} cart`,
    };
  } catch (error) {
    return {
      success: false,
      message: formatError(error),
    };
  }
}

export async function getMyCart() {
  try {
    const { sessionCartId, userId } = await getCartSession();

    const cart = await prisma.cart.findFirst({
      where: userId ? { userId } : { sessionCartId },
    });

    if (!cart) return undefined;

    return convertToPlainObject({
      ...cart,
      items: cart.items as CartItem[],
      itemsPrice: cart.itemsPrice.toString(),
      totalPrice: cart.totalPrice.toString(),
      shippingPrice: cart.shippingPrice.toString(),
      taxPrice: cart.taxPrice.toString(),
    });
  } catch (error) {
    console.error("Error fetching cart:", error);
    return undefined;
  }
}

/**
 * Remove item from cart (decrease quantity by 1 or remove if qty = 1)
 */
export async function removeItemFromCart(productId: string) {
  try {
    const {sessionCartId} = await getCartSession();
    if(!sessionCartId) throw new Error("Cart session not found");

    // Get product information
    const product = await prisma.product.findFirst({
      where: { id: productId },
    });
    if (!product) throw new Error("Product not found");

    // Get cart
    const cart = await getMyCart();
    if (!cart) throw new Error("Cart not found");

    // Find item in cart
    const existItem = (cart.items as CartItem[]).find(
      (x) => x.productId === productId
    );
    if (!existItem) throw new Error("Item not found in cart");

    // Update cart items based on current quantity
    if (existItem.qty === 1) {
      // Remove item if quantity is 1
      cart.items = (cart.items as CartItem[]).filter(
        (x) => x.productId !== existItem.productId
      );
    } else {
      // Decrease quantity by 1
      existItem.qty -= 1;
    }

    // Update cart with new items and recalculate prices
    await updateCartPrices(cart.id, cart.items as CartItem[]);

    // Revalidate product page
    revalidatePath(`/products/${product.slug}`);

    return {
      success: true,
      message: `${product.name} removed from cart`,
    };
  } catch (error) {
    return {
      success: false,
      message: formatError(error),
    };
  }
}
