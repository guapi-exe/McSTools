export var Rotation;
(function (Rotation) {
    Rotation["NONE"] = "none";
    Rotation["CLOCKWISE_90"] = "clockwise_90";
    Rotation["CLOCKWISE_180"] = "180";
    Rotation["COUNTERCLOCKWISE_90"] = "counterclockwise_90";
})(Rotation || (Rotation = {}));
(function (Rotation) {
    function getRandom(random) {
        return [Rotation.NONE, Rotation.CLOCKWISE_90, Rotation.CLOCKWISE_180, Rotation.COUNTERCLOCKWISE_90][random.nextInt(4)];
    }
    Rotation.getRandom = getRandom;
})(Rotation || (Rotation = {}));
//# sourceMappingURL=Rotation.js.map