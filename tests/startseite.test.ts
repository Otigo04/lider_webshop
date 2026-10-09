import { test } from "node:test";
import assert from "node:assert/strict";
import { neuZuerst, querschnitt } from "@/lib/startseite";

type A = { id: string; category_id: string; neu: boolean };
const a = (id: string, category_id: string, neu = false): A => ({
  id,
  category_id,
  neu,
});
const neu = (x: A) => x.neu;
const ids = (l: A[]) => l.map((x) => x.id);

test("Neues steht vorn, die Reihenfolge innerhalb bleibt stabil", () => {
  const liste = [a("1", "k"), a("2", "k", true), a("3", "k"), a("4", "k", true)];
  assert.deepEqual(ids(neuZuerst(liste, neu)), ["2", "4", "1", "3"]);
});

test("neuZuerst verändert die Eingabe nicht", () => {
  const liste = [a("1", "k"), a("2", "k", true)];
  neuZuerst(liste, neu);
  assert.deepEqual(ids(liste), ["1", "2"]);
});

test("Querschnitt: erst alles Neue, dann reihum die Warengruppen", () => {
  const liste = [
    a("a1", "A"),
    a("a2", "A"),
    a("b1", "B"),
    a("b2", "B"),
    a("c1", "C", true),
  ];
  assert.deepEqual(ids(querschnitt(liste, neu, 10)), [
    "c1",
    "a1",
    "b1",
    "a2",
    "b2",
  ]);
});

test("Querschnitt: kein Artikel doppelt, Obergrenze gilt auch für Neues", () => {
  const liste = [a("n1", "A", true), a("n2", "A", true), a("n3", "B", true), a("x", "B")];
  const q = querschnitt(liste, neu, 2);
  assert.deepEqual(ids(q), ["n1", "n2"]);
  const alle = ids(querschnitt(liste, neu, 10));
  assert.equal(new Set(alle).size, alle.length);
});
