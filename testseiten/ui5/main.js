sap.ui.define([
  "sap/m/App", "sap/m/Page", "sap/m/Label", "sap/m/Input", "sap/m/Select", "sap/ui/core/Item", "sap/m/DatePicker",
  "sap/m/Button", "sap/m/MessageStrip", "sap/m/Table", "sap/m/Column", "sap/m/ColumnListItem", "sap/m/Text",
  "sap/ui/layout/form/SimpleForm", "sap/m/Toolbar", "sap/m/ToolbarSpacer", "sap/m/Title", "sap/m/SearchField"
], function (App, Page, Label, Input, Select, Item, DatePicker, Button, MessageStrip, Table, Column, ColumnListItem,
  Text, SimpleForm, Toolbar, ToolbarSpacer, Title, SearchField) {
  "use strict";
  // Typische Fiori-Erfassungsmaske ohne eigene IDs: UI5 vergibt sie selbst (__input0, __button3 …).
  const lief = new Input({ placeholder: "Lieferant suchen", showValueHelp: true });
  const betrag = new Input({ type: "Number" });
  const titel = new Select({ items: [new Item({ text: "Bitte wählen" }), new Item({ text: "0601 52701 Geschäftsbedarf" })] });
  const datum = new DatePicker();
  const form = new SimpleForm({
    editable: true, title: "Kopfdaten",
    content: [
      new Label({ text: "Lieferant", labelFor: lief, required: true }), lief,
      new Label({ text: "Betrag (EUR)", labelFor: betrag, required: true }), betrag,
      new Label({ text: "Haushaltstitel", labelFor: titel }), titel,
      new Label({ text: "Lieferdatum", labelFor: datum }), datum,
      new Input({ placeholder: "Bemerkung" })            // Feld ohne Label: nur Platzhalter
    ]
  });
  const rows = ["Büromaterial", "Toner", "Druckerpapier"].map(t => new ColumnListItem({ cells: [
    new Text({ text: t }), new Text({ text: "1" }),
    new Button({ icon: "sap-icon://edit", type: "Transparent" }),            // Symbolknopf ohne Tooltip
    new Button({ icon: "sap-icon://delete", type: "Transparent", tooltip: "Position löschen" })
  ] }));
  const table = new Table({
    headerToolbar: new Toolbar({ content: [new Title({ text: "Positionen" }), new ToolbarSpacer(),
      new SearchField({ width: "12rem" }), new Button({ icon: "sap-icon://add" })] }),
    columns: [new Column({ header: new Text({ text: "Bezeichnung" }) }), new Column({ header: new Text({ text: "Menge" }) }),
      new Column({ header: new Text({ text: "" }) }), new Column({ header: new Text({ text: "" }) })],
    items: rows
  });
  const page = new Page({
    title: "Verpflichtung anlegen (UI5-Testseite)", showNavButton: true,
    content: [new MessageStrip({ text: "Pflichtfelder sind mit * markiert.", showIcon: true }), form, table],
    footer: new Toolbar({ content: [new ToolbarSpacer(), new Button({ text: "Entwurf sichern" }),
      new Button({ text: "Weiter", type: "Emphasized" })] })
  });
  new App({ pages: [page] }).placeAt("content");
});
