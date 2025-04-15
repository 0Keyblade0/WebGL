/**
 * @param {number} target
 * @param {number[]} nums
 * @return {number}
 */
var minSubArrayLen = function(target, nums) {
    
    let sum = 0;

    for (i = 0; i < nums.length; i++) {
        sum += nums[i];
    }

    if (sum < target) {
        return 0;
    }

    let index1 = 0;
    let index2 = nums.length;

    while (index1 < index2) {

        if (nums[index1] < nums[index2]) {
        sum -= nums[index1];

        if (sum < target) {
            break;
        }

        index1 += 1;

    } else {
        sum -= nums[index2];

        if (sum < target) {
            break;
        }

        index2 -= 1;
    }

    return index2 - index1 + 1;

    }
};
