import test from "node:test";
import assert from "node:assert/strict";
import { isLocalMongoUri } from "../lib/local-mongo.ts";

test("local demo storage guard accepts loopback MongoDB and rejects remote or ambiguous URIs", () => {
  assert.equal(isLocalMongoUri("mongodb://localhost:27017/khelgrid"), true);
  assert.equal(isLocalMongoUri("mongodb://127.0.0.1:27017/khelgrid"), true);
  assert.equal(isLocalMongoUri("mongodb://[::1]:27017/khelgrid"), true);
  assert.equal(isLocalMongoUri("mongodb+srv://cluster.example.net/khelgrid"), false);
  assert.equal(isLocalMongoUri("mongodb://atlas.example.net:27017/khelgrid"), false);
  assert.equal(isLocalMongoUri("mongodb://localhost:27017,atlas.example.net:27017/khelgrid"), false);
  assert.equal(isLocalMongoUri(undefined), false);
});
