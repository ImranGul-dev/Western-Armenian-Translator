<?php
/**
 * Plugin Name: Tun SaaS Subscription Bridge
 * Description: Carries Tun's short-lived checkout token onto WooCommerce orders and subscriptions so the SaaS account can be linked securely by the signed subscription webhook.
 * Version: 1.0.1
 * Author: Tun
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

const TUN_SAAS_CHECKOUT_QUERY_KEY = 'tun_checkout';
const TUN_SAAS_CHECKOUT_META_KEY  = '_tun_checkout_token';

function tun_saas_mapped_product_ids() {
    return array( 13793, 13794 );
}

function tun_saas_clean_checkout_token( $value ) {
    $value = is_string( $value ) ? strtolower( trim( wp_unslash( $value ) ) ) : '';
    return preg_match( '/^[a-f0-9]{64}$/', $value ) ? $value : '';
}

/**
 * Capture Tun's opaque checkout token before WooCommerce handles the
 * add-to-cart query. When the request is one of Tun's mapped SaaS products,
 * remove any previous SaaS-plan cart item first so a retry/refresh cannot turn
 * a single subscription into quantity 2 or mix Person and Schools together.
 */
function tun_saas_capture_checkout_token() {
    if ( ! function_exists( 'WC' ) || ! WC()->session ) {
        return;
    }

    if ( ! isset( $_GET[ TUN_SAAS_CHECKOUT_QUERY_KEY ] ) ) {
        return;
    }

    $token = tun_saas_clean_checkout_token( $_GET[ TUN_SAAS_CHECKOUT_QUERY_KEY ] );
    if ( ! $token ) {
        return;
    }

    WC()->session->set( TUN_SAAS_CHECKOUT_META_KEY, $token );

    $requested_product_id = isset( $_GET['add-to-cart'] )
        ? absint( wp_unslash( $_GET['add-to-cart'] ) )
        : 0;

    if ( ! in_array( $requested_product_id, tun_saas_mapped_product_ids(), true ) || ! WC()->cart ) {
        return;
    }

    foreach ( WC()->cart->get_cart() as $cart_item_key => $cart_item ) {
        $product_id   = isset( $cart_item['product_id'] ) ? absint( $cart_item['product_id'] ) : 0;
        $variation_id = isset( $cart_item['variation_id'] ) ? absint( $cart_item['variation_id'] ) : 0;

        if (
            in_array( $product_id, tun_saas_mapped_product_ids(), true ) ||
            in_array( $variation_id, tun_saas_mapped_product_ids(), true )
        ) {
            WC()->cart->remove_cart_item( $cart_item_key );
        }
    }
}
// WooCommerce loads the cart from session on wp_loaded before its add-to-cart
// handler runs at priority 20. Priority 15 lets us normalize the SaaS cart first.
add_action( 'wp_loaded', 'tun_saas_capture_checkout_token', 15 );

/**
 * A Tun SaaS checkout represents one account subscription, not a purchasable
 * quantity. Keep the mapped plan product at quantity 1 for the active Tun
 * checkout session, including Cart/Checkout Blocks and classic checkout.
 */
function tun_saas_sell_checkout_plan_individually( $sold_individually, $product ) {
    if ( $sold_individually || ! function_exists( 'WC' ) || ! WC()->session || ! is_a( $product, 'WC_Product' ) ) {
        return $sold_individually;
    }

    $token = tun_saas_clean_checkout_token( WC()->session->get( TUN_SAAS_CHECKOUT_META_KEY ) );
    if ( ! $token ) {
        return $sold_individually;
    }

    $product_id = absint( $product->get_id() );
    $parent_id  = absint( $product->get_parent_id() );

    return in_array( $product_id, tun_saas_mapped_product_ids(), true ) ||
        in_array( $parent_id, tun_saas_mapped_product_ids(), true );
}
add_filter( 'woocommerce_is_sold_individually', 'tun_saas_sell_checkout_plan_individually', 20, 2 );

function tun_saas_add_token_to_order( $order, $data ) {
    if ( ! function_exists( 'WC' ) || ! WC()->session || ! is_a( $order, 'WC_Order' ) ) {
        return;
    }

    $token = tun_saas_clean_checkout_token( WC()->session->get( TUN_SAAS_CHECKOUT_META_KEY ) );
    if ( $token ) {
        $order->update_meta_data( TUN_SAAS_CHECKOUT_META_KEY, $token );
    }
}
add_action( 'woocommerce_checkout_create_order', 'tun_saas_add_token_to_order', 20, 2 );

function tun_saas_add_token_to_store_api_order( $order ) {
    if ( ! function_exists( 'WC' ) || ! WC()->session || ! is_a( $order, 'WC_Order' ) ) {
        return;
    }

    $token = tun_saas_clean_checkout_token( WC()->session->get( TUN_SAAS_CHECKOUT_META_KEY ) );
    if ( $token ) {
        $order->update_meta_data( TUN_SAAS_CHECKOUT_META_KEY, $token );
        $order->save();
    }
}
add_action( 'woocommerce_store_api_checkout_order_processed', 'tun_saas_add_token_to_store_api_order', 20, 1 );

function tun_saas_copy_token_to_subscription( $subscription, $order, $recurring_cart ) {
    if ( ! is_a( $subscription, 'WC_Subscription' ) || ! is_a( $order, 'WC_Order' ) ) {
        return;
    }

    $token = tun_saas_clean_checkout_token( $order->get_meta( TUN_SAAS_CHECKOUT_META_KEY, true ) );
    if ( ! $token && function_exists( 'WC' ) && WC()->session ) {
        $token = tun_saas_clean_checkout_token( WC()->session->get( TUN_SAAS_CHECKOUT_META_KEY ) );
    }

    if ( $token ) {
        $subscription->update_meta_data( TUN_SAAS_CHECKOUT_META_KEY, $token );
        $subscription->save();
    }
}
add_action( 'woocommerce_checkout_subscription_created', 'tun_saas_copy_token_to_subscription', 20, 3 );

function tun_saas_clear_checkout_token( $order_id ) {
    if ( function_exists( 'WC' ) && WC()->session ) {
        WC()->session->__unset( TUN_SAAS_CHECKOUT_META_KEY );
    }
}
add_action( 'woocommerce_thankyou', 'tun_saas_clear_checkout_token', 20, 1 );
