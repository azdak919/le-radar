(function () {
  var form = document.querySelector('form');
  var button = form.querySelector('button');
  if (button) button.hidden = true;
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var result = document.getElementById('result');
    result.textContent = 'Aucune version proposée. La version en place reste.';
  });
})();
