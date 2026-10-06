"""تفقيط المبالغ بالعربية (للسندات): 150000 → «مائة وخمسون ألف دينار فقط لا غير»."""

from decimal import ROUND_HALF_UP, Decimal

_ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"]
_TEENS = {
    10: "عشرة", 11: "أحد عشر", 12: "اثنا عشر", 13: "ثلاثة عشر", 14: "أربعة عشر",
    15: "خمسة عشر", 16: "ستة عشر", 17: "سبعة عشر", 18: "ثمانية عشر", 19: "تسعة عشر",
}
_TENS = {2: "عشرون", 3: "ثلاثون", 4: "أربعون", 5: "خمسون", 6: "ستون", 7: "سبعون", 8: "ثمانون", 9: "تسعون"}
_HUNDREDS = {
    1: "مائة", 2: "مائتان", 3: "ثلاثمائة", 4: "أربعمائة", 5: "خمسمائة",
    6: "ستمائة", 7: "سبعمائة", 8: "ثمانمائة", 9: "تسعمائة",
}
# (القيمة، المفرد، المثنى، الجمع للأعداد 3..10)
_SCALES = [
    (10**9, "مليار", "ملياران", "مليارات"),
    (10**6, "مليون", "مليونان", "ملايين"),
    (10**3, "ألف", "ألفان", "آلاف"),
]
MAX_AMOUNT = 10**12 - 1


def _below_thousand(n: int) -> str:
    """1..999 بصيغة المذكر."""
    parts: list[str] = []
    hundreds, rest = divmod(n, 100)
    if hundreds:
        parts.append(_HUNDREDS[hundreds])
    if rest:
        if rest < 10:
            parts.append(_ONES[rest])
        elif rest < 20:
            parts.append(_TEENS[rest])
        else:
            tens, ones = divmod(rest, 10)
            parts.append(f"{_ONES[ones]} و{_TENS[tens]}" if ones else _TENS[tens])
    return " و".join(parts)


def _scaled(count: int, singular: str, dual: str, plural: str) -> str:
    if count == 1:
        return singular
    if count == 2:
        return dual
    if 3 <= count <= 10:
        return f"{_ONES[count]} {plural}"
    # «مائتا ألف» (الإضافة تحذف النون)، وغيرها «<العدد> ألف»
    words = "مائتا" if count % 1000 == 200 and count == 200 else _below_thousand(count)
    return f"{words} {singular}"


def number_to_words(n: int, construct_last: bool = False) -> str:
    """عدد صحيح غير سالب بالحروف (المذكر). construct_last: إذا انتهى العدد بمثنى (ألفان/مليونان)
    وسيليه المعدود تُحذف النون: «ألفا دينار»."""
    if n < 0 or n > MAX_AMOUNT:
        raise ValueError("خارج النطاق المدعوم")
    if n == 0:
        return "صفر"
    parts: list[str] = []
    for value, singular, dual, plural in _SCALES:
        count, n = divmod(n, value)
        if count:
            is_last = n == 0
            word = _scaled(count, singular, dual, plural)
            if construct_last and is_last and count == 2:
                word = dual[:-1]  # ألفان → ألفا
            parts.append(word)
    if n:
        parts.append(_below_thousand(n))
    return " و".join(parts)


def _unit(n: int, one: str, dual: str, few: str, many: str, tamyeez: str) -> str:
    """المعدود: مفرد/مثنى/جمع (3–10) / تمييز منصوب (11–99) / مجرور (مائة وما فوق)."""
    if n == 1:
        return one
    if n == 2:
        return dual
    if 3 <= n % 100 <= 10:
        return few
    if 11 <= n % 100 <= 99:
        return tamyeez
    return many


def amount_in_words(amount: Decimal | int | str) -> str:
    """مبلغ بالدينار العراقي: «مائة وخمسون ألف دينار فقط لا غير». الكسور تُقرأ فلسًا (1 دينار = 1000 فلس)."""
    value = Decimal(amount).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    if value < 0:
        raise ValueError("المبلغ لا يكون سالبًا")
    dinars = int(value)
    fils = int((value - dinars) * 1000)
    if dinars > MAX_AMOUNT:
        raise ValueError("المبلغ كبير جدًا للتفقيط")

    if dinars == 1:
        text = "دينار واحد"
    elif dinars == 2:
        text = "ديناران"
    elif dinars == 0 and fils:
        text = ""
    else:
        text = f"{number_to_words(dinars, construct_last=True)} {_unit(dinars, 'دينار', 'ديناران', 'دنانير', 'دينار', 'دينارًا')}"
    if fils:
        fils_text = f"{number_to_words(fils)} {_unit(fils, 'فلس', 'فلسان', 'فلوس', 'فلس', 'فلسًا')}"
        text = f"{text} و{fils_text}" if text else fils_text
    return f"{text} فقط لا غير"
