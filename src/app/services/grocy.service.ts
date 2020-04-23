import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";

import { getString, setString } from "tns-core-modules/application-settings";

import { GrocyProduct, GrocyLocation, GrocyQuantityUnit, GrocyItemCreated, GrocyProductAPIReturn } from "./grocy.interfaces";
import { Observable, of } from "rxjs";
import { map, exhaustMap, mapTo } from "rxjs/operators";

export interface OpenProductsParams {
  productId: number | string;
  quantity: number;
}

export interface ConsumeProductsParams {
  productId: number | string;
  quantity: number;
  spoiled: boolean;
  locationId?: string | number;
}

interface CreateProductParams {
  name: string;
  description: string;
  location_id: string | number;
  quantity_unit_id_purchase: number;
  quantity_unit_id_stock: number;
  quantity_unit_factor_purchase_to_stock: number;
  barcodes: string[];
  min_stock_amount: number;
  default_best_before_days: number;
  default_best_before_days_after_open: number;
  default_best_before_days_after_thawing: number;
  default_best_before_days_after_freezing: number;
}

export interface PurchaseProductsParams {
  productId: number | string;
  quantity: number;
  bestBeforeDate: string;
  locationId?: number | string;
}

export interface GrocySystemInfoResponse {
  grocy_version: { Version: string; };
}

@Injectable({
  providedIn: "root"
})
export class GrocyService {
  get apiHost() {
    return getString("grocy.apiHost", "");
  }
  set apiHost(value) {
    setString("grocy.apiHost", value);
  }

  get apiKey() {
    return getString("grocy.apiKey", "");
  }
  set apiKey(value) {
    setString("grocy.apiKey", value);
  }

  constructor(
    private http: HttpClient
  ) { }

  getSystemInfo(host = this.apiHost, key = this.apiKey) {
    return this.http.get<GrocySystemInfoResponse>(
      `${host}/system/info`,
      { headers: {"GROCY-API-KEY": key} }
    );
  }

  searchForBarcode(barcode: string) {
    return this.http.get<{product: GrocyProduct}>(
      `${this.apiHost}/stock/products/by-barcode/${barcode}`,
      { headers: {"GROCY-API-KEY": this.apiKey} }
    );
  }

  quantityUnits(): Observable<GrocyQuantityUnit[]> {
    return this.http.get<GrocyQuantityUnit[]>(
      `${this.apiHost}/objects/quantity_units`,
      { headers: {"GROCY-API-KEY": this.apiKey} }
    );
  }

  getLocation(locationId: number): Observable<GrocyLocation> {
    return this.http.get<GrocyLocation>(
      `${this.apiHost}/objects/locations/${locationId}`,
      { headers: {"GROCY-API-KEY": this.apiKey} }
    );
  }

  locations(): Observable<GrocyLocation[]> {
    return this.http.get<GrocyLocation[]>(
      `${this.apiHost}/objects/locations`,
      { headers: {"GROCY-API-KEY": this.apiKey} }
    );
  }

  getProduct(id: string | number): Observable<GrocyProduct> {
    return this.http.get<GrocyProductAPIReturn>(
      `${this.apiHost}/objects/products/${id}`,
      { headers: {"GROCY-API-KEY": this.apiKey} }
    ).pipe(
      map(this.convertProductApiToLocal)
    );
  }

  addBarcodeToProduct(productId: string | number, newBarcode: string): Observable<boolean> {
    return this.getProduct(productId).pipe(
      exhaustMap(product => {
        if (product.barcodes.indexOf(newBarcode) > -1) {
          return of(true);
        } else {
          return this.http.put(
            `${this.apiHost}/objects/products/${productId}`,
            { barcode:  product.barcodes.concat([newBarcode]).join(",")},
            { headers: {"GROCY-API-KEY": this.apiKey} }
          ).pipe(mapTo(true));
        }
      })
    );
  }

  allProducts(): Observable<GrocyProduct[]> {
    return this.http.get<GrocyProductAPIReturn[]>(
      `${this.apiHost}/objects/products`,
      { headers: {"GROCY-API-KEY": this.apiKey} }
    ).pipe(
      map(r => r.map(this.convertProductApiToLocal))
    );
  }

  createProduct(productParams: CreateProductParams): Observable<GrocyProduct> {
    return this.http.post<GrocyItemCreated>(
      `${this.apiHost}/objects/products`,
      {
        name: productParams.name,
        description: productParams.description,
        location_id: productParams.location_id,
        qu_id_purchase: productParams.quantity_unit_id_purchase,
        qu_id_stock: productParams.quantity_unit_id_stock,
        qu_factor_purchase_to_stock: productParams.quantity_unit_factor_purchase_to_stock,
        barcode: productParams.barcodes.join(","),
        min_stock_amount: productParams.min_stock_amount,
        default_best_before_days: productParams.default_best_before_days,
        default_best_before_days_after_open: productParams.default_best_before_days_after_open,
        default_best_before_days_after_thawing: productParams.default_best_before_days_after_thawing,
        default_best_before_days_after_freezing: productParams.default_best_before_days_after_freezing
      },
      { headers: {"GROCY-API-KEY": this.apiKey} }
    ).pipe(
      map(r => ({
        ...productParams,
        location_id: Number(productParams.location_id),
        id: r.created_object_id
      }))
    );
  }

  createLocation(name: string, description: string, isFreezer: boolean): Observable<GrocyLocation> {
    return this.http.post<GrocyItemCreated>(
      `${this.apiHost}/objects/locations`,
      {
        name,
        description,
        is_freezer: isFreezer ? "1" : "0"
      },
      { headers: {"GROCY-API-KEY": this.apiKey} }
    ).pipe(
      map(r => ({
        id: r.created_object_id,
        name,
        description,
        is_freezer: isFreezer ? "1" : "0"
      }))
    );
  }

  undoBooking(transactionId: string) {
    return this.http.post<void>(
      `${this.apiHost}/stock/bookings/${transactionId}/undo`,
      {},
      { headers: {"GROCY-API-KEY": this.apiKey} }
    );
  }

  undoTransaction(transactionId: string) {
    return this.http.post<void>(
      `${this.apiHost}/stock/transactions/${transactionId}/undo`,
      {},
      { headers: {"GROCY-API-KEY": this.apiKey} }
    );
  }

  openProduct(openParams: OpenProductsParams) {
    return this.http.post<{id: string; stock_id: string}>(
      `${this.apiHost}/stock/products/${openParams.productId}/consume`,
      {amount: openParams.quantity},
      { headers: {"GROCY-API-KEY": this.apiKey} }
    );
  }

  consumeProduct(consumeParams: ConsumeProductsParams) {
    return this.http.post<{id: string; stock_id: string}>(
      `${this.apiHost}/stock/products/${consumeParams.productId}/consume`,
      {
        amount: consumeParams.quantity,
        transaction_type: "consume",
        spoiled: consumeParams.spoiled,
        location_id: consumeParams.locationId
      },
      { headers: {"GROCY-API-KEY": this.apiKey} }
    );
  }

  purchaseProduct(purchaseProduct: PurchaseProductsParams) {
    return this.http.post<{id: string; stock_id: string}>(
      `${this.apiHost}/stock/products/${purchaseProduct.productId}/add`,
      {
        amount: purchaseProduct.quantity,
        best_before_date: purchaseProduct.bestBeforeDate,
        transaction_type: "purchase",
        location_id: purchaseProduct.locationId
      },
      { headers: {"GROCY-API-KEY": this.apiKey} }
    );
  }

  private convertProductApiToLocal(data: GrocyProductAPIReturn): GrocyProduct {
    return {
      ...data,
      barcodes: data.barcode.split(","),
      quantity_unit_id_purchase: Number(data.qu_id_purchase),
      quantity_unit_id_stock: Number(data.qu_id_stock),
      quantity_unit_factor_purchase_to_stock: Number(data.qu_factor_purchase_to_stock),
      location_id: Number(data.location_id),
      min_stock_amount: Number(data.min_stock_amount),
      default_best_before_days: Number(data.default_best_before_days),
      default_best_before_days_after_open: Number(data.default_best_before_days_after_open),
      default_best_before_days_after_freezing: Number(data.default_best_before_days_after_freezing),
      default_best_before_days_after_thawing: Number(data.default_best_before_days_after_thawing)
    };
  }
}
